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
}

pub fn get_greeting() -> &'static str {
    "Hello, World!"
}

#[cfg(test)]
mod tests {
    use super::*;
    use gen::prompts_e01::schema::shared::{
        EnumWithCommonFields, EnumWithCommonFields_NotSuccess, EnumWithCommonFields_Success, Expr,
        Expr_KindAdd, Expr_KindNumber,
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
}
