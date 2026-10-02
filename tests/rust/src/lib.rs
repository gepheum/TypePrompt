pub mod gen {
    pub mod prompts_01;
    pub mod prompts_02;
    pub mod prompts_03;
    pub mod prompts_04;
    pub mod prompts_05;
    pub mod prompts_06;
    pub mod prompts_07;
    pub mod prompts_e01;
    pub mod prompts_e02;
    pub mod prompts_e03;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn block_on<F: std::future::Future>(f: F) -> F::Output {
        let waker = std::task::Waker::noop();
        let mut cx = std::task::Context::from_waker(&waker);
        let mut f = std::pin::pin!(f);
        loop {
            match f.as_mut().poll(&mut cx) {
                std::task::Poll::Ready(val) => return val,
                std::task::Poll::Pending => panic!("Pending not supported"),
            }
        }
    }

    // ─── 01 Basics: Translate ──────────────────────────────────────────────────

    #[test]
    fn test_01_basics_translate() {
        let prompt =
            gen::prompts_01::PROMPTS.render_translate(&gen::prompts_01::schema::translate::Input {
                text: "Hello world".to_string(),
                target_language: "French".to_string(),
            });

        assert_eq!(prompt.output_format, gen::prompts_01::OutputFormat::TEXT);
        assert_eq!(format!("{}", prompt.template_id), "Main:Translate");
        assert_eq!(prompt.template_id, gen::prompts_01::TemplateId::Translate);

        assert!(prompt.system_message.contains("professional translator"));
        assert!(prompt.user_message.contains("French"));
        assert!(prompt.user_message.contains("<Text>"));

        assert_eq!(prompt.examples.len(), 2);
        assert_eq!(
            prompt.examples[0].response,
            "La réunion est prévue pour lundi à 15h."
        );
        assert!(prompt.examples[0].user_message.contains("<Text>"));

        assert_eq!(prompt.parse_response("Bonjour").unwrap(), "Bonjour");
        assert!(prompt.tools.is_empty());
    }

    // ─── 02 Structured Output: TriageTicket ─────────────────────────────────────

    #[test]
    fn test_02_structured_output_triage_ticket() {
        let prompt = gen::prompts_02::PROMPTS.render_triage_ticket(
            &gen::prompts_02::schema::triage_ticket::Input {
                subject: "App crashes on login".to_string(),
                body: "It crashes every time.".to_string(),
                customer_tier: gen::prompts_02::schema::triage_ticket::Input_CustomerTier::Pro,
                recent_tickets: vec![],
            },
        );

        assert!(prompt.output_format.is_json());
        if let gen::prompts_02::OutputFormat::Json(json_fmt) = &prompt.output_format {
            assert_eq!(json_fmt.json_schema["type"], "object");
            assert!(json_fmt.json_schema["properties"]["category"].is_object());
            assert!(json_fmt.json_schema["properties"]["urgency"].is_object());
            assert!(json_fmt.json_schema["required"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!("category")));
            assert!(json_fmt.json_schema["required"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!("urgency")));
        } else {
            panic!("Expected JsonOutputFormat");
        }
        assert!(prompt.system_message.contains("urgency"));
        assert!(prompt.system_message.contains("\"critical\""));
        assert!(!prompt.system_message.contains("<c>"));

        assert_eq!(prompt.examples.len(), 2);
        assert!(prompt.examples[0].response.contains("\"technical-issue\""));
        assert!(prompt.examples[1].response.contains("\"feature-request\""));

        let result = prompt
            .parse_response(
                "{\"category\":\"billing\",\"urgency\":\"low\",\"summary\":\"Invoice question\",\"suggestedActions\":[]}",
            )
            .unwrap();
        assert_eq!(
            result.category,
            gen::prompts_02::schema::triage_ticket::TicketCategory::Billing
        );
        assert_eq!(result.category.as_str(), "billing");
        assert_eq!(result.category.to_string(), "billing");
        assert_eq!(format!("{}", result.category), "billing");
        assert_eq!(
            result.urgency,
            gen::prompts_02::schema::triage_ticket::Output_Urgency::Low
        );
        assert_eq!(result.urgency.as_str(), "low");
        assert_eq!(result.summary, "Invoice question");

        // Strips ```json code fences
        let result_json_fences = prompt
            .parse_response(
                "```json\n{\"category\":\"other\",\"urgency\":\"medium\",\"summary\":\"test\",\"suggestedActions\":[]}\n```",
            )
            .unwrap();
        assert_eq!(
            result_json_fences.category,
            gen::prompts_02::schema::triage_ticket::TicketCategory::Other
        );

        // Strips ``` plain fences
        let result_plain_fences = prompt
            .parse_response(
                "```\n{\"category\":\"other\",\"urgency\":\"medium\",\"summary\":\"test\",\"suggestedActions\":[]}\n```",
            )
            .unwrap();
        assert_eq!(
            result_plain_fences.category,
            gen::prompts_02::schema::triage_ticket::TicketCategory::Other
        );

        // Optional field suggested_reply is None when omitted
        let result_opt = prompt
            .parse_response(
                "{\"category\":\"feature-request\",\"urgency\":\"low\",\"summary\":\"Dark mode\",\"suggestedActions\":[\"Log request\"]}",
            )
            .unwrap();
        assert_eq!(
            result_opt.category,
            gen::prompts_02::schema::triage_ticket::TicketCategory::FeatureRequest
        );
        assert_eq!(result_opt.suggested_reply, None);

        // user_message contains YAML-rendered recent_tickets
        let p = gen::prompts_02::PROMPTS.render_triage_ticket(
            &gen::prompts_02::schema::triage_ticket::Input {
                subject: "X".to_string(),
                body: "Y".to_string(),
                customer_tier: gen::prompts_02::schema::triage_ticket::Input_CustomerTier::Pro,
                recent_tickets: vec![
                    gen::prompts_02::schema::triage_ticket::Input_RecentTickets {
                        id: "T-1".to_string(),
                        summary: "Login bug".to_string(),
                        category:
                            gen::prompts_02::schema::triage_ticket::TicketCategory::TechnicalIssue,
                    },
                ],
            },
        );
        assert!(p.user_message.contains("T-1"));

        assert!(prompt.user_message.contains("subject:"));
        assert!(prompt.user_message.contains("customerTier:"));

        assert_eq!(
            prompt.meta.model,
            gen::prompts_02::schema::meta::Meta_Model::Gpt4o
        );
        assert_eq!(prompt.meta.temperature, Some(0.2));
    }

    #[test]
    fn test_02_complex_schemas_generate_page_tree() {
        let provider = gen::prompts_02::schema::generate_page_tree::Provider {
            name: "CloudX".to_string(),
            region: "us-east".to_string(),
            category: gen::prompts_02::schema::generate_page_tree::ProductCategory::Compute,
            pricing: gen::prompts_02::schema::generate_page_tree::Pricing {
                model: gen::prompts_02::schema::generate_page_tree::Pricing_Model::PerHour,
                base_price: 0.1,
                overage: None,
            },
            benchmarks: vec![gen::prompts_02::schema::generate_page_tree::Benchmark {
                name: "throughput".to_string(),
                score: 1000.0,
                unit: "rps".to_string(),
            }],
            pros: vec!["fast".to_string(), "reliable".to_string()],
            cons: vec!["pricey".to_string()],
        };

        let prompt = gen::prompts_02::PROMPTS.render_generate_page_tree(
            &gen::prompts_02::schema::generate_page_tree::Input {
                providers: vec![provider],
                use_case: "serving ML inference workloads".to_string(),
                audience: gen::prompts_02::schema::generate_page_tree::Input_Audience::Architect,
            },
        );

        assert!(prompt.output_format.is_json());
        assert_eq!(format!("{}", prompt.template_id), "Main:GeneratePageTree");
        assert_eq!(
            prompt.template_id,
            gen::prompts_02::TemplateId::GeneratePageTree
        );
        assert!(prompt
            .user_message
            .contains("serving ML inference workloads"));
        assert!(prompt.user_message.contains("CloudX"));
        assert!(prompt.user_message.contains("architect"));
        assert!(prompt.tools.is_empty());

        let result = prompt.parse_response(
            r#"{"kind":"section","title":"Overview","children":[{"kind":"heading","level":"h1","text":"CloudX"},{"kind":"paragraph","text":"Fast compute provider."},{"kind":"button","label":"Sign Up","url":"https://cloudx.example.com"}]}"#,
        ).unwrap();
        match result {
            gen::prompts_02::schema::generate_page_tree::PageNode::KindSection(section) => {
                assert_eq!(section.title, Some("Overview".to_string()));
                assert_eq!(section.children.len(), 3);
            }
            _ => panic!("Expected KindSection"),
        }
    }

    // ─── 03 Tools: ResearchQuestion ─────────────────────────────────────────────

    struct MockWebSearchExecutor;
    impl gen::prompts_03::tool_executor::WebSearch for MockWebSearchExecutor {
        async fn web_search(
            &self,
            _input: gen::prompts_03::schema::web_search::Input,
        ) -> gen::prompts_03::schema::web_search::Output {
            gen::prompts_03::schema::web_search::Output {
                results: vec![gen::prompts_03::schema::web_search::Output_Results {
                    title: "Tokyo Population 2024".to_string(),
                    url: "https://example.com/tokyo".to_string(),
                    snippet: "14 million".to_string(),
                }],
            }
        }
    }

    #[test]
    fn test_03_tools_research_question() {
        let prompt = gen::prompts_03::PROMPTS.render_research_question(
            &gen::prompts_03::schema::research_question::Input {
                question: "Tokyo population?".to_string(),
            },
        );

        assert!(prompt.tools.contains_key("webSearch"));
        assert_eq!(prompt.tools.get("webSearch").unwrap().name, "webSearch");
        assert!(prompt
            .tools
            .get("webSearch")
            .unwrap()
            .description
            .contains("Search the web"));
        let ws_tool = prompt.tools.get("webSearch").unwrap();
        assert_eq!(ws_tool.input_json_schema["type"], "object");
        assert_eq!(
            ws_tool.input_json_schema["properties"]["query"]["type"],
            "string"
        );
        assert_eq!(
            ws_tool.input_json_schema["required"],
            serde_json::json!(["query"])
        );
        assert_eq!(
            gen::prompts_03::prompt_tools::ResearchQuestion::WebSearch.tool_name(),
            "webSearch"
        );
        assert_eq!(
            gen::prompts_03::prompt_tools::ResearchQuestion::WebSearch.as_str(),
            "webSearch"
        );
        assert_eq!(
            gen::prompts_03::prompt_tools::ResearchQuestion::WebSearch.to_string(),
            "webSearch"
        );

        assert_eq!(prompt.examples.len(), 1);
        assert_eq!(prompt.examples[0].intermediate_steps.len(), 1);
        let tc = &prompt.examples[0].intermediate_steps[0].tool_calls[0];
        assert_eq!(tc.call_id, "s1");
        assert_eq!(tc.tool_name, "webSearch");
        assert!(tc.stringified_input.contains("Tokyo population 2024"));

        // execute_tools calls executor and returns output
        let tool_calls = vec![gen::prompts_03::ToolCall {
            call_id: "call_1".to_string(),
            tool_name: "webSearch".to_string(),
            stringified_input: "{\"query\":\"Tokyo population\"}".to_string(),
        }];
        let results = block_on(prompt.execute_tools(&tool_calls, &MockWebSearchExecutor)).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].call_id, "call_1");
        assert!(results[0]
            .stringified_output
            .contains("Tokyo Population 2024"));

        // execute_tools with multiple tool calls runs concurrently and preserves order
        let multi_tool_calls = vec![
            gen::prompts_03::ToolCall {
                call_id: "call_1".to_string(),
                tool_name: "webSearch".to_string(),
                stringified_input: "{\"query\":\"Tokyo population\"}".to_string(),
            },
            gen::prompts_03::ToolCall {
                call_id: "call_2".to_string(),
                tool_name: "webSearch".to_string(),
                stringified_input: "{\"query\":\"Kyoto population\"}".to_string(),
            },
        ];
        let multi_results =
            block_on(prompt.execute_tools(&multi_tool_calls, &MockWebSearchExecutor)).unwrap();
        assert_eq!(multi_results.len(), 2);
        assert_eq!(multi_results[0].call_id, "call_1");
        assert_eq!(multi_results[1].call_id, "call_2");

        // execute_tools with empty list returns Ok(vec![])
        let empty_results = block_on(prompt.execute_tools(&[], &MockWebSearchExecutor)).unwrap();
        assert!(empty_results.is_empty());

        // execute_tools on prompt with no tools returns Ok(vec![]) if empty, Err if not empty
        let prompt_01 =
            gen::prompts_01::PROMPTS.render_translate(&gen::prompts_01::schema::translate::Input {
                text: "test".to_string(),
                target_language: "French".to_string(),
            });
        let no_tools_empty =
            block_on(prompt_01.execute_tools(&[], &gen::prompts_01::NO_TOOLS)).unwrap();
        assert!(no_tools_empty.is_empty());

        let bad_no_tools_call = vec![gen::prompts_01::ToolCall {
            call_id: "c1".to_string(),
            tool_name: "anyTool".to_string(),
            stringified_input: "{}".to_string(),
        }];
        assert!(
            block_on(prompt_01.execute_tools(&bad_no_tools_call, &gen::prompts_01::NO_TOOLS))
                .is_err()
        );

        // execute_tools returns error for unknown tool
        let bad_calls = vec![gen::prompts_03::ToolCall {
            call_id: "c1".to_string(),
            tool_name: "noSuchTool".to_string(),
            stringified_input: "{}".to_string(),
        }];
        let bad_results =
            block_on(prompt.execute_tools(&bad_calls, &MockWebSearchExecutor)).unwrap();
        assert_eq!(bad_results.len(), 1);
        assert_eq!(bad_results[0].call_id, "c1");
        assert_eq!(
            bad_results[0].error.as_deref(),
            Some("Tool not found: noSuchTool")
        );
        assert!(
            bad_results[0]
                .stringified_output
                .contains(r#""error":"Tool not found: noSuchTool""#)
                || bad_results[0]
                    .stringified_output
                    .contains(r#""error": "Tool not found: noSuchTool""#)
        );

        // execute_tools returns error for invalid input json
        let invalid_input_calls = vec![gen::prompts_03::ToolCall {
            call_id: "c_bad_input".to_string(),
            tool_name: "webSearch".to_string(),
            stringified_input: "{bad json".to_string(),
        }];
        let invalid_input_results =
            block_on(prompt.execute_tools(&invalid_input_calls, &MockWebSearchExecutor)).unwrap();
        assert_eq!(invalid_input_results.len(), 1);
        assert_eq!(invalid_input_results[0].call_id, "c_bad_input");
        assert!(invalid_input_results[0]
            .error
            .as_deref()
            .unwrap()
            .contains("Failed to parse tool input"));
        assert!(invalid_input_results[0]
            .stringified_output
            .contains("Failed to parse tool input"));
    }

    // ─── 04 Variants: WriteProductDescription ───────────────────────────────────

    #[test]
    fn test_04_variants_write_product_description() {
        let features = vec![
            "removes 99.9% of contaminants".to_string(),
            "lasts 6 months".to_string(),
        ];

        let marketing = gen::prompts_04::PROMPTS.render_write_product_description(
            &gen::prompts_04::schema::write_product_description::Input {
                product_name: "AquaFilter Pro".to_string(),
                features: features.clone(),
                variant:
                    gen::prompts_04::schema::write_product_description::Input_Variant::Marketing,
            },
        );

        let technical = gen::prompts_04::PROMPTS.render_write_product_description(
            &gen::prompts_04::schema::write_product_description::Input {
                product_name: "AquaFilter Pro".to_string(),
                features: features.clone(),
                variant:
                    gen::prompts_04::schema::write_product_description::Input_Variant::Technical,
            },
        );

        let brief = gen::prompts_04::PROMPTS.render_write_product_description(
            &gen::prompts_04::schema::write_product_description::Input {
                product_name: "AquaFilter Pro".to_string(),
                features: features.clone(),
                variant: gen::prompts_04::schema::write_product_description::Input_Variant::Brief,
            },
        );

        assert!(marketing.system_message.contains("benefit-focused"));
        assert!(technical.system_message.contains("specification-driven"));
        assert!(brief.system_message.contains("single punchy sentence"));

        assert_eq!(marketing.user_message, technical.user_message);
        assert_eq!(technical.user_message, brief.user_message);

        assert!(marketing.user_message.contains("AquaFilter Pro"));
        assert!(marketing
            .user_message
            .contains("removes 99.9% of contaminants"));

        assert_eq!(marketing.examples.len(), 1);
        assert_eq!(
            format!("{}", marketing.template_id),
            "Main:WriteProductDescription"
        );
        assert_eq!(
            format!("{}", technical.template_id),
            "Main:WriteProductDescription"
        );
        assert_eq!(
            format!("{}", brief.template_id),
            "Main:WriteProductDescription"
        );

        assert_ne!(marketing.system_message, technical.system_message);
        assert_ne!(technical.system_message, brief.system_message);
    }

    // ─── 05 Snippets: SummarizeDocument ─────────────────────────────────────────

    #[test]
    fn test_05_snippets_summarize_document() {
        let p_exec = gen::prompts_05::PROMPTS.render_summarize_document(
            &gen::prompts_05::schema::summarize_document::Input {
                title: "T".to_string(),
                content: "C".to_string(),
                audience: gen::prompts_05::schema::summarize_document::Input_Audience::Executive,
                focus_topic: None,
            },
        );
        assert!(p_exec
            .system_message
            .contains("non-technical executive audience"));

        let p_tech = gen::prompts_05::PROMPTS.render_summarize_document(
            &gen::prompts_05::schema::summarize_document::Input {
                title: "T".to_string(),
                content: "C".to_string(),
                audience: gen::prompts_05::schema::summarize_document::Input_Audience::Technical,
                focus_topic: None,
            },
        );
        assert!(p_tech.system_message.contains("technical audience"));

        let p_gen = gen::prompts_05::PROMPTS.render_summarize_document(
            &gen::prompts_05::schema::summarize_document::Input {
                title: "T".to_string(),
                content: "C".to_string(),
                audience: gen::prompts_05::schema::summarize_document::Input_Audience::General,
                focus_topic: None,
            },
        );
        assert!(p_gen.system_message.contains("general audience"));

        let p_focus = gen::prompts_05::PROMPTS.render_summarize_document(
            &gen::prompts_05::schema::summarize_document::Input {
                title: "T".to_string(),
                content: "C".to_string(),
                audience: gen::prompts_05::schema::summarize_document::Input_Audience::General,
                focus_topic: Some("climate change".to_string()),
            },
        );
        assert!(p_focus.system_message.contains("climate change"));

        assert!(!p_exec.system_message.contains("Focus the summary"));
    }

    // ─── 06 Shared Types: ShippingConfirmation & ReturnSlip ─────────────────────

    #[test]
    fn test_06_shared_types() {
        let address = gen::prompts_06::schema::shared::Address {
            street: "1 Main St".to_string(),
            city: "Paris".to_string(),
            country: "France".to_string(),
            postal_code: None,
        };
        let contact = gen::prompts_06::schema::shared::ContactInfo {
            name: "Alice Dupont".to_string(),
            email: "alice@example.com".to_string(),
            address,
        };

        let ship_prompt = gen::prompts_06::PROMPTS.render_shipping_confirmation(
            &gen::prompts_06::schema::shipping_confirmation::Input {
                recipient: contact.clone(),
                order_number: "ORD-1234".to_string(),
                estimated_delivery: "2026-08-20".to_string(),
                items: vec![
                    gen::prompts_06::schema::shipping_confirmation::Input_Items {
                        name: "Laptop".to_string(),
                        quantity: 1,
                    },
                ],
            },
        );

        assert_eq!(
            ship_prompt.output_format,
            gen::prompts_06::OutputFormat::TEXT
        );
        assert_eq!(
            format!("{}", ship_prompt.template_id),
            "Main:ShippingConfirmation"
        );
        assert!(ship_prompt.user_message.contains("Alice Dupont"));
        assert!(ship_prompt.user_message.contains("ORD-1234"));
        assert!(ship_prompt.system_message.contains("confirmation email"));

        let return_prompt = gen::prompts_06::PROMPTS.render_return_slip(
            &gen::prompts_06::schema::return_slip::Input {
                customer: contact,
                return_reason: gen::prompts_06::schema::return_slip::Input_ReturnReason::Defective,
                order_number: "ORD-1234".to_string(),
            },
        );

        assert_eq!(
            return_prompt.output_format,
            gen::prompts_06::OutputFormat::TEXT
        );
        assert_eq!(format!("{}", return_prompt.template_id), "Main:ReturnSlip");
        assert!(return_prompt.user_message.contains("Alice Dupont"));
        assert!(return_prompt.user_message.contains("defective"));
    }

    // ─── 07 Namespaces: Finance & Legal ─────────────────────────────────────────

    #[test]
    fn test_07_namespaces() {
        let fin_summary = gen::prompts_07::PROMPTS
            .finance
            .render_summarize_transaction(
            &gen::prompts_07::schema::finance::summarize_transaction::Input {
                description: "AWS monthly bill".to_string(),
                amount: gen::prompts_07::schema::finance::shared::MoneyAmount {
                    value: 450.0,
                    currency: gen::prompts_07::schema::finance::shared::Currency::Usd,
                },
                category:
                    gen::prompts_07::schema::finance::summarize_transaction::Input_Category::Expense,
                date: "2026-08-01".to_string(),
            },
        );
        assert_eq!(
            format!("{}", fin_summary.template_id),
            "Finance:SummarizeTransaction"
        );
        assert!(fin_summary.output_format.is_json());
        assert!(fin_summary.user_message.contains("AWS monthly bill"));

        let fin_anomaly = gen::prompts_07::PROMPTS.finance.render_detect_anomaly(
            &gen::prompts_07::schema::finance::detect_anomaly::Input {
                recent_transactions: vec![],
                new_transaction:
                    gen::prompts_07::schema::finance::detect_anomaly::Input_NewTransaction {
                        description: "Casino chips".to_string(),
                        amount: gen::prompts_07::schema::finance::shared::MoneyAmount {
                            value: 5000.0,
                            currency: gen::prompts_07::schema::finance::shared::Currency::Usd,
                        },
                        date: "2026-08-17".to_string(),
                    },
            },
        );
        assert_eq!(
            format!("{}", fin_anomaly.template_id),
            "Finance:DetectAnomaly"
        );
        assert!(fin_anomaly.user_message.contains("Casino chips"));
        assert!(fin_anomaly.tools.is_empty());

        let legal_nda = gen::prompts_07::PROMPTS.legal.render_draft_nda(
            &gen::prompts_07::schema::legal::draft_nda::Input {
                disclosing_party: gen::prompts_07::schema::legal::shared::Party {
                    name: "Acme Corp".to_string(),
                    role: gen::prompts_07::schema::legal::shared::Party_Role::Client,
                    jurisdiction: "California".to_string(),
                },
                receiving_party: gen::prompts_07::schema::legal::shared::Party {
                    name: "Beta LLC".to_string(),
                    role: gen::prompts_07::schema::legal::shared::Party_Role::Counterparty,
                    jurisdiction: "Delaware".to_string(),
                },
                purpose_of_disclosure: "Evaluating a potential acquisition".to_string(),
                duration_years: 3,
            },
        );
        assert_eq!(format!("{}", legal_nda.template_id), "Legal:DraftNda");
        assert_eq!(legal_nda.output_format, gen::prompts_07::OutputFormat::TEXT);
        assert!(legal_nda.user_message.contains("Acme Corp"));
        assert!(legal_nda.user_message.contains("Beta LLC"));
        assert!(legal_nda
            .system_message
            .contains("non-disclosure agreement"));

        let legal_clause = gen::prompts_07::PROMPTS.legal.render_summarize_clause(
            &gen::prompts_07::schema::legal::summarize_clause::Input {
                clause_text: "The party shall indemnify and hold harmless...".to_string(),
                reviewing_party: gen::prompts_07::schema::legal::shared::Party {
                    name: "Alice".to_string(),
                    role: gen::prompts_07::schema::legal::shared::Party_Role::Client,
                    jurisdiction: "NY".to_string(),
                },
            },
        );
        assert_eq!(
            format!("{}", legal_clause.template_id),
            "Legal:SummarizeClause"
        );
        assert!(legal_clause.output_format.is_json());
        assert!(legal_clause.user_message.contains("Alice"));
        assert!(legal_clause.user_message.contains("indemnify"));
        assert!(legal_clause.user_message.contains("<Clause>"));
    }

    // ─── E01 AnalyzeSalesData: CSV & TSV formatting ─────────────────────────────

    #[test]
    fn test_e01_analyze_sales_data_csv_and_tsv() {
        let rows = vec![
            gen::prompts_e01::schema::analyze_sales_data::SalesRow {
                product: "Widget A".to_string(),
                units: 120,
                revenue_cents: 240000,
                region: "north".to_string(),
            },
            gen::prompts_e01::schema::analyze_sales_data::SalesRow {
                product: "Widget B".to_string(),
                units: 85,
                revenue_cents: 340000,
                region: "south".to_string(),
            },
        ];

        let csv = gen::prompts_e01::PROMPTS.render_analyze_sales_data(
            &gen::prompts_e01::schema::analyze_sales_data::Input {
                rows: rows.clone(),
                question: "Top product?".to_string(),
                variant: gen::prompts_e01::schema::analyze_sales_data::Input_Variant::Csv,
            },
        );

        let tsv = gen::prompts_e01::PROMPTS.render_analyze_sales_data(
            &gen::prompts_e01::schema::analyze_sales_data::Input {
                rows,
                question: "Top product?".to_string(),
                variant: gen::prompts_e01::schema::analyze_sales_data::Input_Variant::Tsv,
            },
        );

        assert!(csv
            .user_message
            .contains("product,units,revenueCents,region"));
        assert!(csv.user_message.contains("Widget A,120,240000,north"));
        assert!(csv.user_message.contains("Widget B,85,340000,south"));

        assert!(tsv
            .user_message
            .contains("product\tunits\trevenueCents\tregion"));
        assert!(tsv.user_message.contains("Widget A\t120\t240000\tnorth"));
        assert!(tsv.user_message.contains("Widget B\t85\t340000\tsouth"));

        assert_ne!(csv.user_message, tsv.user_message);

        assert_eq!(csv.examples.len(), 1);
        assert!(csv.examples[0]
            .user_message
            .contains("product,units,revenueCents,region"));

        assert_eq!(tsv.examples.len(), 1);
        assert!(tsv.examples[0]
            .user_message
            .contains("product\tunits\trevenueCents\tregion"));

        assert!(csv.system_message.contains("comma-separated"));
        assert!(tsv.system_message.contains("tab-separated"));
    }

    // ─── E01 Spec Serialization ─────────────────────────────────────────────────

    use gen::prompts_e01::schema::analyze_sales_data::Input_Variant;
    use gen::prompts_e01::schema::shared::{
        ComplexType, ComplexType_OptStringUnion, ComplexType_StringUnion, EnumWithCommonFields,
        EnumWithCommonFields_NotSuccess, EnumWithCommonFields_Success, Expr, Expr_KindAdd,
        Expr_KindNumber, Matrix, Square, E,
    };

    #[test]
    fn test_string_enum_serialization() {
        let variant = Input_Variant::Csv;
        let json = serde_json::to_string(&variant).unwrap();
        assert_eq!(json, "\"csv\"");

        let decoded: Input_Variant = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded, Input_Variant::Csv);
    }

    #[test]
    fn test_expr_serialization() {
        let expr = Expr::KindAdd(Box::new(Expr_KindAdd {
            left: Expr::KindNumber(Expr_KindNumber { value: 1.0 }),
            right: Expr::KindNumber(Expr_KindNumber { value: 2.0 }),
        }));

        let json = serde_json::to_string(&expr).unwrap();
        assert!(json.contains("\"kind\":\"add\""));

        let decoded: Expr = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded, expr);
    }

    #[test]
    fn test_common_fields_getters() {
        let not_success = EnumWithCommonFields::NotSuccess(EnumWithCommonFields_NotSuccess {
            x: 10,
            y: 20.5,
            z: "err".to_string(),
        });
        let success = EnumWithCommonFields::Success(EnumWithCommonFields_Success {
            x: 42,
            y: 84.0,
            z: 99,
        });

        assert_eq!(*not_success.x(), 10);
        assert_eq!(*not_success.y(), 20.5);

        assert_eq!(*success.x(), 42);
        assert_eq!(*success.y(), 84.0);
    }

    #[test]
    fn test_matrix_serialization() {
        let matrix = Matrix {
            matrix: vec![],
            other_matrix: None,
            foo: None,
            ints: vec![1, 2, 3],
            init: true,
            encode: false,
        };

        let json = serde_json::to_string(&matrix).unwrap();
        assert!(json.contains("\"kind\":\"matrix\""));

        let decoded: Matrix = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded, matrix);
    }

    #[test]
    fn test_complex_type_serialization() {
        let sq = Square {
            size: 10.0,
            from_json: "fj".to_string(),
            self_: "sf".to_string(),
        };
        let sq2 = Square {
            size: 20.0,
            from_json: "fj2".to_string(),
            self_: "sf2".to_string(),
        };
        let sq3 = Square {
            size: 30.0,
            from_json: "fj3".to_string(),
            self_: "sf3".to_string(),
        };
        let sq4 = Square {
            size: 40.0,
            from_json: "fj4".to_string(),
            self_: "sf4".to_string(),
        };

        let full = ComplexType {
            string_field: "hello".to_string(),
            int_field: 42,
            num_field: 3.14,
            bool_field: true,
            enum_field: E::FooBar,
            string_union: ComplexType_StringUnion::FooBar,
            union_field: Expr::KindNumber(Expr_KindNumber { value: 100.0 }),
            struct_field: sq.clone(),
            string_list: vec!["a".to_string(), "b".to_string()],
            struct_list: vec![sq2.clone()],
            matrix: vec![vec![1, 2], vec![3, 4]],
            map_field: [("key1".to_string(), 10), ("key2".to_string(), 20)]
                .into_iter()
                .collect(),
            opt_string: Some("optional hello".to_string()),
            opt_int: Some(99),
            opt_num: Some(2.718),
            opt_bool: Some(false),
            opt_enum: Some(E::If),
            opt_string_union: Some(ComplexType_OptStringUnion::ZooKar),
            opt_union: Some(Expr::KindNumber(Expr_KindNumber { value: 200.0 })),
            opt_struct: Some(sq3),
            opt_string_list: Some(vec!["x".to_string(), "y".to_string()]),
            opt_struct_list: Some(vec![sq4]),
            opt_matrix: Some(vec![vec![5, 6], vec![7, 8]]),
            opt_map: Some([("optKey".to_string(), 30)].into_iter().collect()),
        };

        let full_json = serde_json::to_string(&full).unwrap();
        let parsed_full: ComplexType = serde_json::from_str(&full_json).unwrap();
        assert_eq!(parsed_full, full);
        assert_eq!(parsed_full.string_union.to_string(), "foo-bar");
        assert_eq!(
            parsed_full.opt_string_union.as_ref().unwrap().to_string(),
            "zooKar"
        );

        // Omitted optional fields
        let omitted = ComplexType {
            string_field: "hello".to_string(),
            int_field: 42,
            num_field: 3.14,
            bool_field: true,
            enum_field: E::FooBar,
            string_union: ComplexType_StringUnion::FooBar,
            union_field: Expr::KindNumber(Expr_KindNumber { value: 100.0 }),
            struct_field: sq,
            string_list: vec!["a".to_string(), "b".to_string()],
            struct_list: vec![sq2],
            matrix: vec![vec![1, 2], vec![3, 4]],
            map_field: [("key1".to_string(), 10), ("key2".to_string(), 20)]
                .into_iter()
                .collect(),
            opt_string: None,
            opt_int: None,
            opt_num: None,
            opt_bool: None,
            opt_enum: None,
            opt_string_union: None,
            opt_union: None,
            opt_struct: None,
            opt_string_list: None,
            opt_struct_list: None,
            opt_matrix: None,
            opt_map: None,
        };

        let omitted_json = serde_json::to_string(&omitted).unwrap();
        assert!(!omitted_json.contains("optString"));
        assert!(!omitted_json.contains("optInt"));
        assert!(!omitted_json.contains("optNum"));
        assert!(!omitted_json.contains("optBool"));
        assert!(!omitted_json.contains("optEnum"));
        assert!(!omitted_json.contains("optStringUnion"));
        assert!(!omitted_json.contains("optUnion"));
        assert!(!omitted_json.contains("optStruct"));
        assert!(!omitted_json.contains("optStringList"));
        assert!(!omitted_json.contains("optStructList"));
        assert!(!omitted_json.contains("optMatrix"));
        assert!(!omitted_json.contains("optMap"));

        let parsed_omitted: ComplexType = serde_json::from_str(&omitted_json).unwrap();
        assert_eq!(parsed_omitted, omitted);
    }

    // ─── TemplateOverrider ──────────────────────────────────────────────────────

    #[test]
    fn test_template_overrider() {
        let data = gen::prompts_01::TemplateOverrider::templates_data().unwrap();
        let json: serde_json::Value = serde_json::from_str(&data).unwrap();
        let sig = json.get("signature").and_then(|v| v.as_str());
        assert!(sig.is_some());
        assert!(!sig.unwrap().is_empty());

        let wrong_doc = serde_json::json!({
            "signature": "wrong_sig",
            "edition": 0,
            "singleNamespace": true,
            "templates": {},
            "tools": {},
            "sourceFiles": {},
        });
        let wrong_str = serde_json::to_string(&wrong_doc).unwrap();
        assert!(gen::prompts_01::TemplateOverrider::apply_overrides(&wrong_str).is_err());

        let prompts = gen::prompts_01::TemplateOverrider::apply_overrides(&data).unwrap();
        let prompt = prompts.render_translate(&gen::prompts_01::schema::translate::Input {
            text: "Hello".to_string(),
            target_language: "French".to_string(),
        });
        assert!(prompt.user_message.contains("French"));
    }

    // ─── Composite Tool Executor ────────────────────────────────────────────────

    struct TestMyTool;
    impl gen::prompts_e01::tool_executor::MyTool for TestMyTool {
        async fn my_tool(
            &self,
            input: gen::prompts_e01::schema::shared::Square,
        ) -> gen::prompts_e01::schema::my_tool::Output {
            gen::prompts_e01::schema::my_tool::Output {
                shared: gen::prompts_e01::schema::my_tool::Shared {
                    value: "hello".to_string(),
                    square: input,
                },
            }
        }
    }

    struct TestMyOtherTool;
    impl gen::prompts_e01::tool_executor::MyOtherTool for TestMyOtherTool {
        async fn my_other_tool(
            &self,
            input: gen::prompts_e01::schema::shared::Square,
        ) -> Vec<gen::prompts_e01::schema::my_other_tool::Output> {
            vec![gen::prompts_e01::schema::my_other_tool::Output {
                shared: gen::prompts_e01::schema::my_other_tool::Shared {
                    value: "world".to_string(),
                    square: input,
                },
            }]
        }
    }

    struct CombinedExecutor;
    impl gen::prompts_e01::tool_executor::MyTool for CombinedExecutor {
        async fn my_tool(
            &self,
            input: gen::prompts_e01::schema::shared::Square,
        ) -> gen::prompts_e01::schema::my_tool::Output {
            TestMyTool.my_tool(input).await
        }
    }
    impl gen::prompts_e01::tool_executor::MyOtherTool for CombinedExecutor {
        async fn my_other_tool(
            &self,
            input: gen::prompts_e01::schema::shared::Square,
        ) -> Vec<gen::prompts_e01::schema::my_other_tool::Output> {
            TestMyOtherTool.my_other_tool(input).await
        }
    }

    #[test]
    fn test_composite_tool_executor() {
        use gen::prompts_e01::tool_executor::{self, MyOtherTool, MyTool};

        fn assert_composite<T: tool_executor::MyOtherTemplate>(_: &T) {}

        let composite = CombinedExecutor;
        assert_composite(&composite);

        let square = gen::prompts_e01::schema::shared::Square {
            size: 5.0,
            from_json: "a".to_string(),
            self_: "b".to_string(),
        };

        let out1 = block_on(composite.my_tool(square));
        assert_eq!(out1.shared.value, "hello");

        let square2 = gen::prompts_e01::schema::shared::Square {
            size: 5.0,
            from_json: "a".to_string(),
            self_: "b".to_string(),
        };
        let out2 = block_on(composite.my_other_tool(square2));
        assert_eq!(out2.len(), 1);
        assert_eq!(out2[0].shared.value, "world");
    }

    #[test]
    fn test_composite_tool_executor_with_box_and_ref() {
        use gen::prompts_e01::tool_executor::{self, MyOtherTool, MyTool};

        fn assert_composite<T: tool_executor::MyOtherTemplate>(_: &T) {}

        let composite = Box::new(CombinedExecutor);
        assert_composite(&composite);
        assert_composite(&&CombinedExecutor);

        let square = gen::prompts_e01::schema::shared::Square {
            size: 5.0,
            from_json: "a".to_string(),
            self_: "b".to_string(),
        };

        let out1 = block_on(composite.my_tool(square));
        assert_eq!(out1.shared.value, "hello");

        let square2 = gen::prompts_e01::schema::shared::Square {
            size: 5.0,
            from_json: "a".to_string(),
            self_: "b".to_string(),
        };
        let out2 = block_on(composite.my_other_tool(square2));
        assert_eq!(out2.len(), 1);
        assert_eq!(out2[0].shared.value, "world");
    }

    #[test]
    fn test_prompts_send_sync() {
        fn assert_send_sync<T: Send + Sync>(_: &T) {}
        assert_send_sync(&*gen::prompts_01::PROMPTS);
        assert_send_sync(&*gen::prompts_07::PROMPTS);
        assert_send_sync(&*gen::prompts_e02::PROMPTS);
        assert_send_sync(&*gen::prompts_e03::PROMPTS);
    }
}
