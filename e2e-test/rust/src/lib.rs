pub mod gen {
    pub mod prompts_01;
    pub mod prompts_02;
    pub mod prompts_03;
    pub mod prompts_04;
    pub mod prompts_05;
    pub mod prompts_06;
    pub mod prompts_07;
    pub mod prompts_08;
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
            gen::prompts_01::prompts.render_translate(&gen::prompts_01::schema::translate::Input {
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
        let prompt = gen::prompts_02::prompts.render_triage_ticket(
            &gen::prompts_02::schema::triage_ticket::Input {
                subject: "App crashes on login".to_string(),
                body: "It crashes every time.".to_string(),
                customer_tier: gen::prompts_02::schema::triage_ticket::Input_CustomerTier::Pro,
                recent_tickets: vec![],
            },
        );

        assert!(prompt.output_format.is_json());
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
        assert_eq!(
            result.urgency,
            gen::prompts_02::schema::triage_ticket::Output_Urgency::Low
        );
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
        let p = gen::prompts_02::prompts.render_triage_ticket(
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
        let prompt = gen::prompts_03::prompts.render_research_question(
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

        // execute_tools errors for unknown tool
        let bad_calls = vec![gen::prompts_03::ToolCall {
            call_id: "c1".to_string(),
            tool_name: "noSuchTool".to_string(),
            stringified_input: "{}".to_string(),
        }];
        assert!(block_on(prompt.execute_tools(&bad_calls, &MockWebSearchExecutor)).is_err());
    }

    // ─── 04 Variants: WriteProductDescription ───────────────────────────────────

    #[test]
    fn test_04_variants_write_product_description() {
        let features = vec![
            "removes 99.9% of contaminants".to_string(),
            "lasts 6 months".to_string(),
        ];

        let marketing = gen::prompts_04::prompts.render_write_product_description(
            &gen::prompts_04::schema::write_product_description::Input {
                product_name: "AquaFilter Pro".to_string(),
                features: features.clone(),
                variant:
                    gen::prompts_04::schema::write_product_description::Input_Variant::Marketing,
            },
        );

        let technical = gen::prompts_04::prompts.render_write_product_description(
            &gen::prompts_04::schema::write_product_description::Input {
                product_name: "AquaFilter Pro".to_string(),
                features: features.clone(),
                variant:
                    gen::prompts_04::schema::write_product_description::Input_Variant::Technical,
            },
        );

        let brief = gen::prompts_04::prompts.render_write_product_description(
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
        let p_exec = gen::prompts_05::prompts.render_summarize_document(
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

        let p_tech = gen::prompts_05::prompts.render_summarize_document(
            &gen::prompts_05::schema::summarize_document::Input {
                title: "T".to_string(),
                content: "C".to_string(),
                audience: gen::prompts_05::schema::summarize_document::Input_Audience::Technical,
                focus_topic: None,
            },
        );
        assert!(p_tech.system_message.contains("technical audience"));

        let p_gen = gen::prompts_05::prompts.render_summarize_document(
            &gen::prompts_05::schema::summarize_document::Input {
                title: "T".to_string(),
                content: "C".to_string(),
                audience: gen::prompts_05::schema::summarize_document::Input_Audience::General,
                focus_topic: None,
            },
        );
        assert!(p_gen.system_message.contains("general audience"));

        let p_focus = gen::prompts_05::prompts.render_summarize_document(
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

    // ─── 06 TOON Format: WriteComparisonArticle ─────────────────────────────────

    #[test]
    fn test_06_toon_format_write_comparison_article() {
        let provider = gen::prompts_06::schema::write_comparison_article::Provider {
            name: "CloudX".to_string(),
            region: "us-east".to_string(),
            category: gen::prompts_06::schema::write_comparison_article::ProductCategory::Compute,
            pricing: gen::prompts_06::schema::write_comparison_article::Pricing {
                model: gen::prompts_06::schema::write_comparison_article::Pricing_Model::PerHour,
                base_price: 0.1,
                overage: None,
            },
            benchmarks: vec![
                gen::prompts_06::schema::write_comparison_article::Benchmark {
                    name: "throughput".to_string(),
                    score: 1000.0,
                    unit: "rps".to_string(),
                },
            ],
            pros: vec!["fast".to_string(), "reliable".to_string()],
            cons: vec!["pricey".to_string()],
        };

        let prompt = gen::prompts_06::prompts.render_write_comparison_article(
            &gen::prompts_06::schema::write_comparison_article::Input {
                providers: vec![provider],
                use_case: "serving ML inference workloads".to_string(),
                audience:
                    gen::prompts_06::schema::write_comparison_article::Input_Audience::Architect,
            },
        );

        assert!(prompt.output_format.is_json());
        assert_eq!(
            format!("{}", prompt.template_id),
            "Main:WriteComparisonArticle"
        );
        assert_eq!(
            prompt.template_id,
            gen::prompts_06::TemplateId::WriteComparisonArticle
        );
        assert!(prompt
            .user_message
            .contains("serving ML inference workloads"));
        assert!(prompt.user_message.contains("CloudX"));
        assert!(prompt.user_message.contains("architect"));
        assert!(prompt.tools.is_empty());
    }

    // ─── 07 Shared Types: ShippingConfirmation & ReturnSlip ─────────────────────

    #[test]
    fn test_07_shared_types() {
        let address = gen::prompts_07::schema::shared::Address {
            street: "1 Main St".to_string(),
            city: "Paris".to_string(),
            country: "France".to_string(),
            postal_code: None,
        };
        let contact = gen::prompts_07::schema::shared::ContactInfo {
            name: "Alice Dupont".to_string(),
            email: "alice@example.com".to_string(),
            address,
        };

        let ship_prompt = gen::prompts_07::prompts.render_shipping_confirmation(
            &gen::prompts_07::schema::shipping_confirmation::Input {
                recipient: contact.clone(),
                order_number: "ORD-1234".to_string(),
                estimated_delivery: "2026-08-20".to_string(),
                items: vec![
                    gen::prompts_07::schema::shipping_confirmation::Input_Items {
                        name: "Laptop".to_string(),
                        quantity: 1,
                    },
                ],
            },
        );

        assert_eq!(
            ship_prompt.output_format,
            gen::prompts_07::OutputFormat::TEXT
        );
        assert_eq!(
            format!("{}", ship_prompt.template_id),
            "Main:ShippingConfirmation"
        );
        assert!(ship_prompt.user_message.contains("Alice Dupont"));
        assert!(ship_prompt.user_message.contains("ORD-1234"));
        assert!(ship_prompt.system_message.contains("confirmation email"));

        let return_prompt = gen::prompts_07::prompts.render_return_slip(
            &gen::prompts_07::schema::return_slip::Input {
                customer: contact,
                return_reason: gen::prompts_07::schema::return_slip::Input_ReturnReason::Defective,
                order_number: "ORD-1234".to_string(),
            },
        );

        assert_eq!(
            return_prompt.output_format,
            gen::prompts_07::OutputFormat::TEXT
        );
        assert_eq!(format!("{}", return_prompt.template_id), "Main:ReturnSlip");
        assert!(return_prompt.user_message.contains("Alice Dupont"));
        assert!(return_prompt.user_message.contains("defective"));
    }

    // ─── 08 Namespaces: Finance & Legal ─────────────────────────────────────────

    #[test]
    fn test_08_namespaces() {
        let fin_summary = gen::prompts_08::prompts
            .finance
            .render_summarize_transaction(
            &gen::prompts_08::schema::finance::summarize_transaction::Input {
                description: "AWS monthly bill".to_string(),
                amount: gen::prompts_08::schema::finance::shared::MoneyAmount {
                    value: 450.0,
                    currency: gen::prompts_08::schema::finance::shared::Currency::Usd,
                },
                category:
                    gen::prompts_08::schema::finance::summarize_transaction::Input_Category::Expense,
                date: "2026-08-01".to_string(),
            },
        );
        assert_eq!(
            format!("{}", fin_summary.template_id),
            "Finance:SummarizeTransaction"
        );
        assert!(fin_summary.output_format.is_json());
        assert!(fin_summary.user_message.contains("AWS monthly bill"));

        let fin_anomaly = gen::prompts_08::prompts.finance.render_detect_anomaly(
            &gen::prompts_08::schema::finance::detect_anomaly::Input {
                recent_transactions: vec![],
                new_transaction:
                    gen::prompts_08::schema::finance::detect_anomaly::Input_NewTransaction {
                        description: "Casino chips".to_string(),
                        amount: gen::prompts_08::schema::finance::shared::MoneyAmount {
                            value: 5000.0,
                            currency: gen::prompts_08::schema::finance::shared::Currency::Usd,
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

        let legal_nda = gen::prompts_08::prompts.legal.render_draft_nda(
            &gen::prompts_08::schema::legal::draft_nda::Input {
                disclosing_party: gen::prompts_08::schema::legal::shared::Party {
                    name: "Acme Corp".to_string(),
                    role: gen::prompts_08::schema::legal::shared::Party_Role::Client,
                    jurisdiction: "California".to_string(),
                },
                receiving_party: gen::prompts_08::schema::legal::shared::Party {
                    name: "Beta LLC".to_string(),
                    role: gen::prompts_08::schema::legal::shared::Party_Role::Counterparty,
                    jurisdiction: "Delaware".to_string(),
                },
                purpose_of_disclosure: "Evaluating a potential acquisition".to_string(),
                duration_years: 3,
            },
        );
        assert_eq!(format!("{}", legal_nda.template_id), "Legal:DraftNda");
        assert_eq!(legal_nda.output_format, gen::prompts_08::OutputFormat::TEXT);
        assert!(legal_nda.user_message.contains("Acme Corp"));
        assert!(legal_nda.user_message.contains("Beta LLC"));
        assert!(legal_nda
            .system_message
            .contains("non-disclosure agreement"));

        let legal_clause = gen::prompts_08::prompts.legal.render_summarize_clause(
            &gen::prompts_08::schema::legal::summarize_clause::Input {
                clause_text: "The party shall indemnify and hold harmless...".to_string(),
                reviewing_party: gen::prompts_08::schema::legal::shared::Party {
                    name: "Alice".to_string(),
                    role: gen::prompts_08::schema::legal::shared::Party_Role::Client,
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

        let csv = gen::prompts_e01::prompts.render_analyze_sales_data(
            &gen::prompts_e01::schema::analyze_sales_data::Input {
                rows: rows.clone(),
                question: "Top product?".to_string(),
                variant: gen::prompts_e01::schema::analyze_sales_data::Input_Variant::Csv,
            },
        );

        let tsv = gen::prompts_e01::prompts.render_analyze_sales_data(
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
        EnumWithCommonFields, EnumWithCommonFields_NotSuccess, EnumWithCommonFields_Success, Expr,
        Expr_KindAdd, Expr_KindNumber, Matrix,
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
            "templates": {},
            "tools": {},
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
        assert_send_sync(&*gen::prompts_08::PROMPTS);
        assert_send_sync(&*gen::prompts_e02::PROMPTS);
        assert_send_sync(&*gen::prompts_e03::PROMPTS);
    }
}
