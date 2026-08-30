pub mod gen {
    pub mod prompts_e01;
}

pub fn get_greeting() -> &'static str {
    "Hello, World!"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_greeting() {
        assert_eq!(get_greeting(), "Hello, World!");
    }
}
