//! TypePrompt End-to-End Rust Example with Google Gemini API.
//!
//! Demonstrates using TypePrompt prompt templates with typed tool execution
//! and structured JSON output using Google's Gemini API (`generateContent`).

#[path = "gen/prompts.rs"]
pub mod prompts;

use prompts::{schema, tool_executor, Prompt, ToolCall, PROMPTS};

struct MetricsExecutor;

impl tool_executor::GetServiceMetrics for MetricsExecutor {
    async fn get_service_metrics(
        &self,
        input: schema::get_service_metrics::Input,
    ) -> schema::get_service_metrics::Output {
        println!(
            "  [Tool Executed] getServiceMetrics(service='{}')",
            input.service
        );
        match input.service.trim().to_lowercase().as_str() {
            "payment-service" | "payments" => schema::get_service_metrics::Output {
                cpu_usage_percent: 94.8,
                memory_usage_percent: 89.2,
                p99_latency_ms: 2850.0,
                error_rate_percent: 12.4,
                status: schema::get_service_metrics::Output_Status::Degraded,
                active_replicas: 3.0,
            },
            "auth-api" | "auth" => schema::get_service_metrics::Output {
                cpu_usage_percent: 98.2,
                memory_usage_percent: 96.5,
                p99_latency_ms: 4100.0,
                error_rate_percent: 19.8,
                status: schema::get_service_metrics::Output_Status::Down,
                active_replicas: 2.0,
            },
            "search-indexer" | "search" => schema::get_service_metrics::Output {
                cpu_usage_percent: 78.0,
                memory_usage_percent: 84.5,
                p99_latency_ms: 850.0,
                error_rate_percent: 1.2,
                status: schema::get_service_metrics::Output_Status::Healthy,
                active_replicas: 4.0,
            },
            "notification-worker" | "notifications" => schema::get_service_metrics::Output {
                cpu_usage_percent: 62.0,
                memory_usage_percent: 71.0,
                p99_latency_ms: 320.0,
                error_rate_percent: 0.05,
                status: schema::get_service_metrics::Output_Status::Healthy,
                active_replicas: 2.0,
            },
            _ => schema::get_service_metrics::Output {
                cpu_usage_percent: 88.0,
                memory_usage_percent: 82.5,
                p99_latency_ms: 1950.0,
                error_rate_percent: 6.5,
                status: schema::get_service_metrics::Output_Status::Degraded,
                active_replicas: 2.0,
            },
        }
    }
}

/// Generic helper to execute any TypePrompt prompt with Google's Gemini API.
async fn execute_prompt<Output, E>(
    client: &reqwest::Client,
    api_key: &str,
    prompt: &Prompt<Output, E>,
    executor: &E,
) -> Result<Output, Box<dyn std::error::Error + Send + Sync>>
where
    Output: serde::de::DeserializeOwned,
    E: ?Sized,
{
    let model = if prompt.meta.model.is_empty() {
        "gemini-2.5-flash"
    } else {
        &prompt.meta.model
    };
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model, api_key
    );

    // 1. Prepare conversation history with few-shot examples and user prompt
    let mut contents: Vec<serde_json::Value> = Vec::new();
    for example in &prompt.examples {
        contents.push(serde_json::json!({
            "role": "user",
            "parts": [{ "text": &example.user_message }]
        }));
        contents.push(serde_json::json!({
            "role": "model",
            "parts": [{ "text": &example.response }]
        }));
    }
    contents.push(serde_json::json!({
        "role": "user",
        "parts": [{ "text": &prompt.user_message }]
    }));

    // 2. Format tool declarations for Gemini
    let tools_json = if !prompt.tools.is_empty() {
        let declarations: Vec<serde_json::Value> = prompt
            .tools
            .values()
            .map(|t| {
                serde_json::json!({
                    "name": &t.name,
                    "description": &t.description,
                    "parameters": &t.input_json_schema,
                })
            })
            .collect();
        Some(serde_json::json!([
            { "function_declarations": declarations }
        ]))
    } else {
        None
    };

    // 3. Configure generation settings (JSON mode, temperature)
    let mut gen_config = serde_json::Map::new();
    if prompt.output_format.is_json() {
        gen_config.insert(
            "responseMimeType".to_string(),
            serde_json::json!("application/json"),
        );
    }
    if let Some(temp) = prompt.meta.temperature {
        gen_config.insert("temperature".to_string(), serde_json::json!(temp));
    }

    // 4. Conversational tool execution loop
    loop {
        let mut body = serde_json::json!({
            "contents": contents,
        });
        if !prompt.system_message.is_empty() {
            body["system_instruction"] = serde_json::json!({
                "parts": [{ "text": &prompt.system_message }]
            });
        }
        if let Some(tools) = &tools_json {
            body["tools"] = tools.clone();
        }
        if !gen_config.is_empty() {
            body["generationConfig"] = serde_json::Value::Object(gen_config.clone());
        }

        let response = client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let err_text = response.text().await?;
            return Err(format!("Gemini API request failed: {}", err_text).into());
        }

        let res_json: serde_json::Value = response.json().await?;
        let candidate = res_json["candidates"]
            .as_array()
            .and_then(|c| c.first())
            .ok_or_else(|| format!("No candidates returned by Gemini: {}", res_json))?;

        let model_content = candidate["content"].clone();
        let parts = model_content["parts"]
            .as_array()
            .cloned()
            .unwrap_or_default();

        contents.push(model_content);

        // Check if Gemini invoked any tools
        let function_calls: Vec<&serde_json::Value> =
            parts.iter().filter_map(|p| p.get("functionCall")).collect();

        if !function_calls.is_empty() {
            let tool_calls: Vec<ToolCall> = function_calls
                .iter()
                .enumerate()
                .map(|(idx, fc)| {
                    let name = fc["name"].as_str().unwrap_or("").to_string();
                    let args = fc["args"].clone();
                    ToolCall {
                        call_id: format!("call_{}", idx),
                        tool_name: name,
                        stringified_input: args.to_string(),
                    }
                })
                .collect();

            let tool_results = prompt.execute_tools(&tool_calls, executor).await?;

            let mut response_parts = Vec::new();
            for (res, fc) in tool_results.into_iter().zip(function_calls.iter()) {
                let name = fc["name"].as_str().unwrap_or("");
                let content_val: serde_json::Value = serde_json::from_str(&res.stringified_output)
                    .unwrap_or_else(|_| serde_json::json!({ "output": res.stringified_output }));

                response_parts.push(serde_json::json!({
                    "functionResponse": {
                        "name": name,
                        "response": {
                            "name": name,
                            "content": content_val
                        }
                    }
                }));
            }

            contents.push(serde_json::json!({
                "role": "user",
                "parts": response_parts,
            }));
            continue;
        }

        // Final text response: parse and validate into typed Output struct with TypePrompt
        let text_content = parts
            .iter()
            .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join("");

        return prompt.parse_response(&text_content);
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let args: Vec<String> = std::env::args().collect();
    let service = args
        .get(1)
        .cloned()
        .unwrap_or_else(|| "payment-service".to_string());
    let reported_issue = args.get(2).cloned().unwrap_or_else(|| {
        "Elevated checkout timeouts and downstream database connection pool exhaustion.".to_string()
    });

    let api_key = match std::env::var("GEMINI_API_KEY") {
        Ok(key) if !key.trim().is_empty() => key,
        _ => {
            eprintln!("Error: GEMINI_API_KEY environment variable is not set.");
            eprintln!("Please set GEMINI_API_KEY to run against Google Gemini.\n");
            eprintln!("Usage:");
            eprintln!("  export GEMINI_API_KEY=\"AIza...\"");
            eprintln!("  cargo run -- \"{}\" \"{}\"", service, reported_issue);
            std::process::exit(1);
        }
    };

    let client = reqwest::Client::new();

    println!("Investigating operational alert for '{}'...\n", service);
    println!("Reported issue: \"{}\"\n", reported_issue);

    // 1. Render the typed prompt
    let prompt =
        PROMPTS.render_triage_incident::<MetricsExecutor>(&schema::triage_incident::Input {
            service: service.clone(),
            reported_issue: reported_issue.clone(),
        });

    // 2. Execute the prompt with Gemini and the typed tool executor
    let incident = execute_prompt(&client, &api_key, &prompt, &MetricsExecutor).await?;

    println!("\n--- SRE Incident Triage Report ---");
    println!("Service: {}", incident.service);
    println!("Severity: {}", incident.severity.as_str().to_uppercase());
    println!("Root Cause: {}\n", incident.root_cause_summary);
    println!("Telemetry Analysis:\n{}\n", incident.metrics_analysis);
    println!("Action Plan:");
    for item in &incident.action_plan {
        println!("  {}. {}", item.priority as i64, item.action);
        if let Some(cmd) = &item.suggested_command {
            println!("     $ {}", cmd);
        }
    }
    println!(
        "\nFollow-up Recommendation:\n{}",
        incident.follow_up_recommendation
    );

    Ok(())
}
