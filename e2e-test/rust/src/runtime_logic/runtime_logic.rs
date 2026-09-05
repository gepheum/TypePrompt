// <static:rust-imports>
// </static:rust-imports>

// <static:rust-public-types>
pub trait Template<Input, Output, ToolExecutor> {
  fn render(&self, input: Input) -> Prompt<Output, ToolExecutor>;
}

pub struct Prompt<Output, ToolExecutor> {
  pub meta: Meta,
  pub system_message: String,
  pub user_message: String,
  pub examples: Vec<FewShotExample>,
  pub tools: std::collections::HashMap<String, Tool>,
  pub output_format: OutputFormat,
  pub template_id: TemplateId,
  pub _phantom: std::marker::PhantomData<(Output, ToolExecutor)>,
}

impl<Output, ToolExecutor> Prompt<Output, ToolExecutor> {
  pub fn parse_response(&self, response: &str) -> Result<Output, String>
  where
    Output: serde::de::DeserializeOwned,
  {
    match &self.output_format {
      OutputFormat::Json(_) => {
        let mut cleaned = response.trim();
        if cleaned.starts_with("```") {
          if let Some(stripped) = cleaned.strip_prefix("```json") {
            cleaned = stripped;
          } else if let Some(stripped) = cleaned.strip_prefix("```") {
            cleaned = stripped;
          }
          if let Some(stripped) = cleaned.strip_suffix("```") {
            cleaned = stripped;
          }
          cleaned = cleaned.trim();
        }
        serde_json::from_str::<Output>(cleaned)
          .map_err(|e| format!("Template '{:?}': {}", self.template_id, e))
      }
      OutputFormat::Text => {
        serde_json::from_value::<Output>(serde_json::Value::String(response.to_string()))
          .map_err(|e| format!("Template '{:?}': {}", self.template_id, e))
      }
    }
  }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum OutputFormat {
  Json(JsonOutputFormat),
  Text,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct JsonOutputFormat {
  pub stringified_json_schema: String,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct TextOutputFormat;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Tool {
  pub name: String,
  pub description: String,
}
/// A single few-shot example consisting of a user message, optional intermediate
/// tool-call steps, and the expected response.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct FewShotExample {
  pub user_message: String,
  pub intermediate_steps: Vec<IntermediateStepExample>,
  pub response: String,
}

/// One intermediate step within a few-shot example, containing the tool
/// calls made at that step.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct IntermediateStepExample {
  pub tool_calls: Vec<ToolCallExample>,
}

/// A single tool call recorded inside an intermediate step.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ToolCallExample {
  pub call_id: String,
  pub tool_name: String,
  pub stringified_input: String,
  pub stringified_output: String,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ToolCall {
  pub call_id: String,
  pub tool_name: String,
  pub stringified_input: String,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ToolCallResponse {
  pub call_id: String,
  pub stringified_output: String,
}
// </static:rust-public-types>

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TemplateId { Todo }
pub type Meta = ();

// <static:rust-logic>
// </static:rust-logic>

// <generated:spec>
mod spec {
  #[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq)]
  pub(super) struct Templates {
    pub(super) edition: i32,
    pub(super) signature: String,
    pub(super) templates: std::collections::HashMap<String, Template>,
    pub(super) tools: std::collections::HashMap<String, Tool>,
    #[serde(rename = "singleNamespace")]
    pub(super) single_namespace: bool,
    /// The key is a relative path to a .xml file. The value is the file content.
    #[serde(rename = "sourceFiles")]
    pub(super) source_files: std::collections::HashMap<String, String>,
  }

  #[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq)]
  pub(super) struct Template {
    pub(super) name: String,
    pub(super) namespace: String,
    #[serde(rename = "outputFormat")]
    pub(super) output_format: OutputFormat,
    pub(super) tools: Vec<TemplateTool>,
    pub(super) contents: TemplateContents,
    pub(super) snippets: std::collections::HashMap<String, Snippet>,
    #[serde(rename = "outputJsonSchema")]
    pub(super) output_json_schema: Option<serde_json::Value>,
  }

  #[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq)]
  pub(super) enum OutputFormat {
    #[serde(rename = "json")]
    Json,
    #[serde(rename = "text")]
    Text,
  }

  #[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq)]
  pub(super) struct TemplateTool {
    pub(super) id: String,
    pub(super) name: String,
  }

  #[derive(Debug, PartialEq)]
  pub(super) enum TemplateContents {
    KindNoVariants(TemplateContents_KindNoVariants),
    KindVariants(TemplateContents_KindVariants),
  }

  impl serde::Serialize for TemplateContents {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S : serde::Serializer {
      match self {
        TemplateContents::KindNoVariants(v) => serde::Serialize::serialize(v, serializer),
        TemplateContents::KindVariants(v) => serde::Serialize::serialize(v, serializer),
      }
    }
  }

  impl<'de> serde::Deserialize<'de> for TemplateContents {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error> where D : serde::Deserializer<'de> {
      let value = serde_json::Value::deserialize(deserializer)?;
      let discriminant = value.get("kind")
      .and_then(serde_json::Value::as_str)
      .ok_or_else(|| serde::de::Error::missing_field("kind"))?;
      match discriminant {
        "no-variants" => {
          let v = <TemplateContents_KindNoVariants>::deserialize(value).map_err(serde::de::Error::custom)?;
          Ok(TemplateContents::KindNoVariants(v))
        }
        "variants" => {
          let v = <TemplateContents_KindVariants>::deserialize(value).map_err(serde::de::Error::custom)?;
          Ok(TemplateContents::KindVariants(v))
        }
        other => Err(serde::de::Error::unknown_variant(other, &["no-variants", "variants"])),
      }
    }
  }

  #[derive(serde::Deserialize, Debug, PartialEq)]
  pub(super) struct TemplateContents_KindNoVariants {
    pub(super) content: TemplateContent,
  }

  impl serde::Serialize for TemplateContents_KindNoVariants {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: serde::Serializer {
      let mut state = serde::Serializer::serialize_struct(serializer, "TemplateContents_KindNoVariants", 2)?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "kind", &"no-variants")?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "content", &self.content)?;
      serde::ser::SerializeStruct::end(state)
    }
  }

  #[derive(serde::Deserialize, Debug, PartialEq)]
  pub(super) struct TemplateContents_KindVariants {
    pub(super) variants: std::collections::HashMap<String, TemplateContent>,
    pub(super) default_content: TemplateContent,
  }

  impl serde::Serialize for TemplateContents_KindVariants {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: serde::Serializer {
      let mut state = serde::Serializer::serialize_struct(serializer, "TemplateContents_KindVariants", 3)?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "kind", &"variants")?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "variants", &self.variants)?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "defaultContent", &self.default_content)?;
      serde::ser::SerializeStruct::end(state)
    }
  }

  #[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq)]
  pub(super) struct TemplateContent {
    pub(super) meta: Option<serde_json::Value>,
    pub(super) system: Option<Vec<BodyPiece>>,
    pub(super) user: Option<Vec<BodyPiece>>,
    pub(super) examples: Option<Vec<FewShotExample>>,
  }

  #[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq)]
  pub(super) struct FewShotExample {
    pub(super) input: serde_json::Value,
    pub(super) output: serde_json::Value,
    #[serde(rename = "intermediateSteps")]
    pub(super) intermediate_steps: Vec<FewShotExample_IntermediateSteps>,
  }

  #[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq)]
  pub(super) struct FewShotExample_IntermediateSteps {
    #[serde(rename = "toolCalls")]
    pub(super) tool_calls: Vec<ToolCallExample>,
  }

  #[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq)]
  pub(super) struct ToolCallExample {
    #[serde(rename = "callId")]
    pub(super) call_id: String,
    #[serde(rename = "toolId")]
    pub(super) tool_id: String,
    #[serde(rename = "toolName")]
    pub(super) tool_name: String,
    pub(super) input: serde_json::Value,
    pub(super) output: serde_json::Value,
  }

  #[derive(Debug, PartialEq)]
  pub(super) enum BodyPiece {
    KindText(BodyPiece_KindText),
    KindInsertVal(BodyPiece_KindInsertVal),
    KindInsertSnippet(BodyPiece_KindInsertSnippet),
  }

  impl serde::Serialize for BodyPiece {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S : serde::Serializer {
      match self {
        BodyPiece::KindText(v) => serde::Serialize::serialize(v, serializer),
        BodyPiece::KindInsertVal(v) => serde::Serialize::serialize(v, serializer),
        BodyPiece::KindInsertSnippet(v) => serde::Serialize::serialize(v, serializer),
      }
    }
  }

  impl<'de> serde::Deserialize<'de> for BodyPiece {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error> where D : serde::Deserializer<'de> {
      let value = serde_json::Value::deserialize(deserializer)?;
      let discriminant = value.get("kind")
      .and_then(serde_json::Value::as_str)
      .ok_or_else(|| serde::de::Error::missing_field("kind"))?;
      match discriminant {
        "text" => {
          let v = <BodyPiece_KindText>::deserialize(value).map_err(serde::de::Error::custom)?;
          Ok(BodyPiece::KindText(v))
        }
        "insert-val" => {
          let v = <BodyPiece_KindInsertVal>::deserialize(value).map_err(serde::de::Error::custom)?;
          Ok(BodyPiece::KindInsertVal(v))
        }
        "insert-snippet" => {
          let v = <BodyPiece_KindInsertSnippet>::deserialize(value).map_err(serde::de::Error::custom)?;
          Ok(BodyPiece::KindInsertSnippet(v))
        }
        other => Err(serde::de::Error::unknown_variant(other, &["text", "insert-val", "insert-snippet"])),
      }
    }
  }

  #[derive(serde::Deserialize, Debug, PartialEq)]
  pub(super) struct BodyPiece_KindText {
    pub(super) text: String,
  }

  impl serde::Serialize for BodyPiece_KindText {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: serde::Serializer {
      let mut state = serde::Serializer::serialize_struct(serializer, "BodyPiece_KindText", 2)?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "kind", &"text")?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "text", &self.text)?;
      serde::ser::SerializeStruct::end(state)
    }
  }

  #[derive(serde::Deserialize, Debug, PartialEq)]
  pub(super) struct BodyPiece_KindInsertVal {
    pub(super) val: Expression,
    pub(super) format: InsertFormat,
    pub(super) indent: String,
  }

  impl serde::Serialize for BodyPiece_KindInsertVal {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: serde::Serializer {
      let mut state = serde::Serializer::serialize_struct(serializer, "BodyPiece_KindInsertVal", 4)?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "kind", &"insert-val")?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "val", &self.val)?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "format", &self.format)?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "indent", &self.indent)?;
      serde::ser::SerializeStruct::end(state)
    }
  }

  #[derive(serde::Deserialize, Debug, PartialEq)]
  pub(super) struct BodyPiece_KindInsertSnippet {
    /// Snippet name.
    pub(super) snippet: String,
    /// Only contains whitespace characters.
    pub(super) indent: String,
  }

  impl serde::Serialize for BodyPiece_KindInsertSnippet {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: serde::Serializer {
      let mut state = serde::Serializer::serialize_struct(serializer, "BodyPiece_KindInsertSnippet", 3)?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "kind", &"insert-snippet")?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "snippet", &self.snippet)?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "indent", &self.indent)?;
      serde::ser::SerializeStruct::end(state)
    }
  }

  #[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq)]
  pub(super) enum InsertFormat {
    #[serde(rename = "text")]
    Text,
    #[serde(rename = "json")]
    Json,
    #[serde(rename = "yaml")]
    Yaml,
    #[serde(rename = "toon")]
    Toon,
    #[serde(rename = "csv")]
    Csv,
    #[serde(rename = "tsv")]
    Tsv,
  }

  #[derive(Debug, PartialEq)]
  pub(super) enum Expression {
    KindInput(Expression_KindInput),
    KindProperty(Box<Expression_KindProperty>),
  }

  impl serde::Serialize for Expression {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S : serde::Serializer {
      match self {
        Expression::KindInput(v) => serde::Serialize::serialize(v, serializer),
        Expression::KindProperty(v) => serde::Serialize::serialize(v, serializer),
      }
    }
  }

  impl<'de> serde::Deserialize<'de> for Expression {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error> where D : serde::Deserializer<'de> {
      let value = serde_json::Value::deserialize(deserializer)?;
      let discriminant = value.get("kind")
      .and_then(serde_json::Value::as_str)
      .ok_or_else(|| serde::de::Error::missing_field("kind"))?;
      match discriminant {
        "input" => {
          let v = <Expression_KindInput>::deserialize(value).map_err(serde::de::Error::custom)?;
          Ok(Expression::KindInput(v))
        }
        "property" => {
          let v = <Box<Expression_KindProperty>>::deserialize(value).map_err(serde::de::Error::custom)?;
          Ok(Expression::KindProperty(v))
        }
        other => Err(serde::de::Error::unknown_variant(other, &["input", "property"])),
      }
    }
  }

  #[derive(serde::Deserialize, Debug, PartialEq)]
  pub(super) struct Expression_KindInput {}

  impl serde::Serialize for Expression_KindInput {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: serde::Serializer {
      let mut state = serde::Serializer::serialize_struct(serializer, "Expression_KindInput", 1)?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "kind", &"input")?;
      serde::ser::SerializeStruct::end(state)
    }
  }

  #[derive(serde::Deserialize, Debug, PartialEq)]
  pub(super) struct Expression_KindProperty {
    pub(super) left: Expression,
    pub(super) property: String,
  }

  impl serde::Serialize for Expression_KindProperty {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: serde::Serializer {
      let mut state = serde::Serializer::serialize_struct(serializer, "Expression_KindProperty", 3)?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "kind", &"property")?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "left", &self.left)?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "property", &self.property)?;
      serde::ser::SerializeStruct::end(state)
    }
  }

  #[derive(Debug, PartialEq)]
  pub(super) enum Snippet {
    KindSnippet(Snippet_KindSnippet),
    KindSnippetIf(Snippet_KindSnippetIf),
    KindSnippetSwitch(Snippet_KindSnippetSwitch),
  }

  impl serde::Serialize for Snippet {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S : serde::Serializer {
      match self {
        Snippet::KindSnippet(v) => serde::Serialize::serialize(v, serializer),
        Snippet::KindSnippetIf(v) => serde::Serialize::serialize(v, serializer),
        Snippet::KindSnippetSwitch(v) => serde::Serialize::serialize(v, serializer),
      }
    }
  }

  impl<'de> serde::Deserialize<'de> for Snippet {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error> where D : serde::Deserializer<'de> {
      let value = serde_json::Value::deserialize(deserializer)?;
      let discriminant = value.get("kind")
      .and_then(serde_json::Value::as_str)
      .ok_or_else(|| serde::de::Error::missing_field("kind"))?;
      match discriminant {
        "snippet" => {
          let v = <Snippet_KindSnippet>::deserialize(value).map_err(serde::de::Error::custom)?;
          Ok(Snippet::KindSnippet(v))
        }
        "snippet-if" => {
          let v = <Snippet_KindSnippetIf>::deserialize(value).map_err(serde::de::Error::custom)?;
          Ok(Snippet::KindSnippetIf(v))
        }
        "snippet-switch" => {
          let v = <Snippet_KindSnippetSwitch>::deserialize(value).map_err(serde::de::Error::custom)?;
          Ok(Snippet::KindSnippetSwitch(v))
        }
        other => Err(serde::de::Error::unknown_variant(other, &["snippet", "snippet-if", "snippet-switch"])),
      }
    }
  }

  #[derive(serde::Deserialize, Debug, PartialEq)]
  pub(super) struct Snippet_KindSnippet {
    pub(super) body: Vec<BodyPiece>,
  }

  impl serde::Serialize for Snippet_KindSnippet {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: serde::Serializer {
      let mut state = serde::Serializer::serialize_struct(serializer, "Snippet_KindSnippet", 2)?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "kind", &"snippet")?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "body", &self.body)?;
      serde::ser::SerializeStruct::end(state)
    }
  }

  #[derive(serde::Deserialize, Debug, PartialEq)]
  pub(super) struct Snippet_KindSnippetIf {
    pub(super) expression: Expression,
    pub(super) is: Snippet_KindSnippetIf_Is,
    pub(super) then: Vec<BodyPiece>,
    pub(super) else_: Vec<BodyPiece>,
  }

  impl serde::Serialize for Snippet_KindSnippetIf {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: serde::Serializer {
      let mut state = serde::Serializer::serialize_struct(serializer, "Snippet_KindSnippetIf", 5)?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "kind", &"snippet-if")?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "expression", &self.expression)?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "is", &self.is)?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "then", &self.then)?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "else", &self.else_)?;
      serde::ser::SerializeStruct::end(state)
    }
  }

  #[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq)]
  pub(super) enum Snippet_KindSnippetIf_Is {
    #[serde(rename = "not-null")]
    NotNull,
    #[serde(rename = "not-empty")]
    NotEmpty,
    #[serde(rename = "true")]
    True,
  }

  #[derive(serde::Deserialize, Debug, PartialEq)]
  pub(super) struct Snippet_KindSnippetSwitch {
    pub(super) expression: Expression,
    pub(super) branches: std::collections::HashMap<String, Vec<BodyPiece>>,
  }

  impl serde::Serialize for Snippet_KindSnippetSwitch {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: serde::Serializer {
      let mut state = serde::Serializer::serialize_struct(serializer, "Snippet_KindSnippetSwitch", 3)?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "kind", &"snippet-switch")?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "expression", &self.expression)?;
      serde::ser::SerializeStruct::serialize_field(&mut state, "branches", &self.branches)?;
      serde::ser::SerializeStruct::end(state)
    }
  }

  #[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq)]
  pub(super) struct Tool {
    pub(super) id: String,
    pub(super) name: String,
    pub(super) description: String,
    #[serde(rename = "outputJsonSchema")]
    pub(super) output_json_schema: Option<serde_json::Value>,
  }
}  // mod spec
// </generated:spec>
