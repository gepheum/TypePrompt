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

pub fn get_greeting() -> &'static str {
    "Hello, World!"
}

#[cfg(test)]
mod tests {
    use super::*;
    use gen::prompts_e01::schema::shared::{
        EnumWithCommonFields, EnumWithCommonFields_NotSuccess, EnumWithCommonFields_Success, Expr,
        Expr_KindAdd, Expr_KindNumber, Matrix,
    };
    use gen::prompts_e01::schema::AnalyzeSalesData::Input_Variant;

    #[test]
    fn test_greeting() {
        assert_eq!(get_greeting(), "Hello, World!");
    }

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

    struct TestMyTool;
    impl gen::prompts_e01::tool_executor::MyTool for TestMyTool {
        async fn my_tool(
            &self,
            input: gen::prompts_e01::schema::shared::Square,
        ) -> gen::prompts_e01::schema::MyTool::Output {
            gen::prompts_e01::schema::MyTool::Output {
                shared: gen::prompts_e01::schema::MyTool::Shared {
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
        ) -> Vec<gen::prompts_e01::schema::MyOtherTool::Output> {
            vec![gen::prompts_e01::schema::MyOtherTool::Output {
                shared: gen::prompts_e01::schema::MyOtherTool::Shared {
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
        ) -> gen::prompts_e01::schema::MyTool::Output {
            TestMyTool.my_tool(input).await
        }
    }
    impl gen::prompts_e01::tool_executor::MyOtherTool for CombinedExecutor {
        async fn my_other_tool(
            &self,
            input: gen::prompts_e01::schema::shared::Square,
        ) -> Vec<gen::prompts_e01::schema::MyOtherTool::Output> {
            TestMyOtherTool.my_other_tool(input).await
        }
    }

    #[test]
    fn test_composite_tool_executor() {
        use gen::prompts_e01::tool_executor::{self, MyOtherTool, MyTool};

        fn assert_composite<T: tool_executor::MyOtherTemplate>(_: &T) {}

        let composite = CombinedExecutor;
        assert_composite(&composite);

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
    fn test_prompts_types() {
        struct MockTemplate<Input, Output, ToolExecutor: ?Sized = ()> {
            _phantom: std::marker::PhantomData<(Input, Output, fn() -> ToolExecutor)>,
        }
        impl<Input, Output, ToolExecutor: ?Sized>
            gen::prompts_01::Template<Input, Output, ToolExecutor>
            for MockTemplate<Input, Output, ToolExecutor>
        {
            fn render(&self, _input: Input) -> gen::prompts_01::Prompt<Output, ToolExecutor> {
                gen::prompts_01::Prompt {
                    meta: (),
                    system_message: String::new(),
                    user_message: String::new(),
                    examples: vec![],
                    tools: std::collections::HashMap::new(),
                    output_format: gen::prompts_01::OutputFormat::Text,
                    template_id: gen::prompts_01::TemplateId::Translate,
                    _phantom: std::marker::PhantomData,
                }
            }
        }

        let prompts_01 = gen::prompts_01::Prompts {
            translate: Box::new(MockTemplate {
                _phantom: std::marker::PhantomData,
            }),
        };
        fn assert_send_sync<T: Send + Sync>(_: &T) {}
        assert_send_sync(&prompts_01);

        let prompts_e02 = gen::prompts_e02::Prompts {};
        assert_send_sync(&prompts_e02);
    }
}
