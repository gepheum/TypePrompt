

/// Namespace containing the user-defined datatypes.
pub mod schema {
  pub mod shared {
    // Exported as 'schema::shared::Expr'
    /// An expression
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    enum Expr {
      KindNumber(Expr_KindNumber),
      KindAdd(Expr_KindAdd),
      KindIf(Expr_KindIf),
    }

    impl Serialize for Expr {
      fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S : Serializer {
        match self {
          Expr::KindNumber(v) => v.serialize(serializer),
          Expr::KindAdd(v) => v.serialize(serializer),
          Expr::KindIf(v) => v.serialize(serializer),
        }
      }
    }

    impl<'de> Deserialize<'de> for Expr {
      fn deserialize<D>(deserializer: D) -> Result<Self, D::Error> where D : Deserializer<'de> {
        let value = serde::Value::deserialize(deserializer)?;
        let discriminant = value.get("kind")
        .and_then(serde::Value::as_str)
        .ok_or_else(|| de::Error::missing_field("kind"))?;
        match discriminant {
          "number" => {
            let v = Expr_KindNumber::deserialize(value).map_err(de::Error::custom)?;
            Ok(Expr::KindNumber(v))
          }
          "add" => {
            let v = Expr_KindAdd::deserialize(value).map_err(de::Error::custom)?;
            Ok(Expr::KindAdd(v))
          }
          "if" => {
            let v = Expr_KindIf::deserialize(value).map_err(de::Error::custom)?;
            Ok(Expr::KindIf(v))
          }
          other => Err(de::Error::unknown_variant(other, &["number", "add", "if"])),
        }
      }
    }

    // Exported as 'schema::shared::Expr_KindNumber'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct Expr_KindNumber {
      pub value: f64,
    }

    impl Serialize for Expr_KindNumber {
      fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: Serializer {
        let mut state = serializer.serialize_struct("Expr_KindNumber", 2)?;
        state.serialize_field("kind", "number")?;
        state.serialize_field("value", &self.value)?;
        state.end()
      }
    }

    // Exported as 'schema::shared::Expr_KindAdd'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct Expr_KindAdd {
      pub left: Expr,
      pub right: Expr,
    }

    impl Serialize for Expr_KindAdd {
      fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: Serializer {
        let mut state = serializer.serialize_struct("Expr_KindAdd", 3)?;
        state.serialize_field("kind", "add")?;
        state.serialize_field("left", &self.left)?;
        state.serialize_field("right", &self.right)?;
        state.end()
      }
    }

    // Exported as 'schema::shared::Expr_KindIf'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct Expr_KindIf {
      pub condition: Expr,
      pub then: Expr,
      pub else_: Expr,
    }

    impl Serialize for Expr_KindIf {
      fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: Serializer {
        let mut state = serializer.serialize_struct("Expr_KindIf", 4)?;
        state.serialize_field("kind", "if")?;
        state.serialize_field("condition", &self.condition)?;
        state.serialize_field("then", &self.then)?;
        state.serialize_field("else", &self.else_)?;
        state.end()
      }
    }

    // Exported as 'schema::shared::EnumWithCommonFields'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    enum EnumWithCommonFields {
      NotSuccess(EnumWithCommonFields_NotSuccess),
      Success(EnumWithCommonFields_Success),
    }

    impl Serialize for EnumWithCommonFields {
      fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S : Serializer {
        match self {
          EnumWithCommonFields::NotSuccess(v) => v.serialize(serializer),
          EnumWithCommonFields::Success(v) => v.serialize(serializer),
        }
      }
    }

    impl<'de> Deserialize<'de> for EnumWithCommonFields {
      fn deserialize<D>(deserializer: D) -> Result<Self, D::Error> where D : Deserializer<'de> {
        let value = serde::Value::deserialize(deserializer)?;
        let discriminant = value.get("success")
        .and_then(serde::Value::as_str)
        .ok_or_else(|| de::Error::missing_field("success"))?;
        match discriminant {
          false => {
            let v = EnumWithCommonFields_NotSuccess::deserialize(value).map_err(de::Error::custom)?;
            Ok(EnumWithCommonFields::NotSuccess(v))
          }
          true => {
            let v = EnumWithCommonFields_Success::deserialize(value).map_err(de::Error::custom)?;
            Ok(EnumWithCommonFields::Success(v))
          }
          other => Err(de::Error::unknown_variant(other, &[false, true])),
        }
      }
    }

    impl EnumWithCommonFields {
      /// x coordinate
      pub fn x(&self) -> &i32 {
        match self {
          EnumWithCommonFields::NotSuccess(v) => &v.x,
          EnumWithCommonFields::Success(v) => &v.x,
        }
      }
      /// y coordinate
      pub fn y(&self) -> &f64 {
        match self {
          EnumWithCommonFields::NotSuccess(v) => &v.y,
          EnumWithCommonFields::Success(v) => &v.y,
        }
      }
    }

    // Exported as 'schema::shared::EnumWithCommonFields_NotSuccess'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct EnumWithCommonFields_NotSuccess {
      /// x coordinate
      pub x: i32,
      /// y coordinate
      pub y: f64,
      /// z coordinate
      pub z: String,
    }

    impl Serialize for EnumWithCommonFields_NotSuccess {
      fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: Serializer {
        let mut state = serializer.serialize_struct("EnumWithCommonFields_NotSuccess", 4)?;
        state.serialize_field("success", false)?;
        state.serialize_field("x", &self.x)?;
        state.serialize_field("y", &self.y)?;
        state.serialize_field("z", &self.z)?;
        state.end()
      }
    }

    // Exported as 'schema::shared::EnumWithCommonFields_Success'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct EnumWithCommonFields_Success {
      /// x coordinate
      pub x: i32,
      pub y: f64,
      pub z: i32,
    }

    impl Serialize for EnumWithCommonFields_Success {
      fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: Serializer {
        let mut state = serializer.serialize_struct("EnumWithCommonFields_Success", 4)?;
        state.serialize_field("success", true)?;
        state.serialize_field("x", &self.x)?;
        state.serialize_field("y", &self.y)?;
        state.serialize_field("z", &self.z)?;
        state.end()
      }
    }

    // Exported as 'schema::shared::Schema'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct Schema {
      pub e: EnumWithCommonFields,
    }

    // Exported as 'schema::shared::String_'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct String_ {}

    // Exported as 'schema::shared::Boolean'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct Boolean {}

    // Exported as 'schema::shared::List'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct List {}

    // Exported as 'schema::shared::Map'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct Map {}

    // Exported as 'schema::shared::EncodeDefault'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct EncodeDefault {}

    // Exported as 'schema::shared::Serializable'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct Serializable {}

    // Exported as 'schema::shared::KindAdd'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct KindAdd {}

    // Exported as 'schema::shared::AnyHolder'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct AnyHolder {
      pub any: serde_json::Value,
    }

    // Exported as 'schema::shared::SerializerHolder'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct SerializerHolder {
      pub serializer: serde_json::Value,
    }

    // Exported as 'schema::shared::Square'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct Square {
      pub size: f64,
      pub from_json: String,
      pub self_: String,
    }

    impl Serialize for Square {
      fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: Serializer {
        let mut state = serializer.serialize_struct("Square", 5)?;
        state.serialize_field("kind", "square")?;
        state.serialize_field("size", &self.size)?;
        state.serialize_field("fromJson", &self.from_json)?;
        state.serialize_field("self", &self.self_)?;
        state.serialize_field("foo", "foo")?;
        state.end()
      }
    }

    // Exported as 'schema::shared::E'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    enum E {
      #[serde(rename = "class")]
      Class,
      #[serde(rename = "if")]
      If,
      #[serde(rename = "foo-BAR")]
      FooBar,
    }

    // Exported as 'schema::shared::Matrix'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct Matrix {
      pub matrix: Vec<Vec<Square>>,
      pub other_matrix: Option<Vec<Vec<Square>>>,
      pub foo: Option<HashMap<String, Vec<Square>>>,
      pub ints: Vec<i32>,
      pub init: bool,
      pub encode: bool,
    }

    impl Serialize for Matrix {
      fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: Serializer {
        let mut state = serializer.serialize_struct("Matrix", 7)?;
        state.serialize_field("kind", "matrix")?;
        state.serialize_field("matrix", &self.matrix)?;
        state.serialize_field("otherMatrix", &self.other_matrix)?;
        state.serialize_field("foo", &self.foo)?;
        state.serialize_field("ints", &self.ints)?;
        state.serialize_field("init", &self.init)?;
        state.serialize_field("encode", &self.encode)?;
        state.end()
      }
    }

    // Exported as 'schema::shared::MatrixUnion'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    enum MatrixUnion {
      KindMatrix(Matrix),
      KindEmpty(MatrixUnion_KindEmpty),
    }

    impl Serialize for MatrixUnion {
      fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S : Serializer {
        match self {
          MatrixUnion::KindMatrix(v) => v.serialize(serializer),
          MatrixUnion::KindEmpty(v) => v.serialize(serializer),
        }
      }
    }

    impl<'de> Deserialize<'de> for MatrixUnion {
      fn deserialize<D>(deserializer: D) -> Result<Self, D::Error> where D : Deserializer<'de> {
        let value = serde::Value::deserialize(deserializer)?;
        let discriminant = value.get("kind")
        .and_then(serde::Value::as_str)
        .ok_or_else(|| de::Error::missing_field("kind"))?;
        match discriminant {
          "matrix" => {
            let v = Matrix::deserialize(value).map_err(de::Error::custom)?;
            Ok(MatrixUnion::KindMatrix(v))
          }
          "empty" => {
            let v = MatrixUnion_KindEmpty::deserialize(value).map_err(de::Error::custom)?;
            Ok(MatrixUnion::KindEmpty(v))
          }
          other => Err(de::Error::unknown_variant(other, &["matrix", "empty"])),
        }
      }
    }

    impl MatrixUnion {
      pub fn init(&self) -> &bool {
        match self {
          MatrixUnion::KindMatrix(v) => &v.init,
          MatrixUnion::KindEmpty(v) => &v.init,
        }
      }
      pub fn encode(&self) -> &bool {
        match self {
          MatrixUnion::KindMatrix(v) => &v.encode,
          MatrixUnion::KindEmpty(v) => &v.encode,
        }
      }
    }

    // Exported as 'schema::shared::MatrixUnion_KindEmpty'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct MatrixUnion_KindEmpty {
      pub init: bool,
      pub encode: bool,
    }

    impl Serialize for MatrixUnion_KindEmpty {
      fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: Serializer {
        let mut state = serializer.serialize_struct("MatrixUnion_KindEmpty", 3)?;
        state.serialize_field("kind", "empty")?;
        state.serialize_field("init", &self.init)?;
        state.serialize_field("encode", &self.encode)?;
        state.end()
      }
    }

    // Exported as 'schema::shared::DiscriminatorCodingKeys'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct DiscriminatorCodingKeys {}
  }

  pub mod AnalyzeSalesData {
    // Exported as 'Schema.AnalyzeSalesData.SalesRow'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct SalesRow {
      pub product: String,
      pub units: i32,
      #[serde(rename = "revenueCents")]
      pub revenue_cents: i32,
      pub region: String,
    }

    // Exported as 'Schema.AnalyzeSalesData.Input'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct Input {
      pub rows: Vec<SalesRow>,
      pub question: String,
      pub variant: Input_Variant,
    }

    // Exported as 'Schema.AnalyzeSalesData.Input_Variant'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    enum Input_Variant {
      #[serde(rename = "csv")]
      Csv,
      #[serde(rename = "tsv")]
      Tsv,
    }

    // Exported as 'Schema.AnalyzeSalesData.Output'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct Output {
      pub analysis: String,
      #[serde(rename = "topProduct")]
      pub top_product: String,
      #[serde(rename = "totalRevenue")]
      pub total_revenue: f64,
    }
  }

  pub mod MyTemplate {
    // Exported as 'Schema.MyTemplate.Input'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct Input {
      pub text: String,
    }

    // Exported as 'Schema.MyTemplate.Output'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct Output {
      #[serde(rename = "reversedText")]
      pub reversed_text: String,
      pub shape: Output_Shape,
    }

    // Exported as 'Schema.MyTemplate.Output_Shape'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    enum Output_Shape {
      KindSquare(shared::Square),
      KindCircle(Output_Shape_KindCircle),
    }

    impl Serialize for Output_Shape {
      fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S : Serializer {
        match self {
          Output_Shape::KindSquare(v) => v.serialize(serializer),
          Output_Shape::KindCircle(v) => v.serialize(serializer),
        }
      }
    }

    impl<'de> Deserialize<'de> for Output_Shape {
      fn deserialize<D>(deserializer: D) -> Result<Self, D::Error> where D : Deserializer<'de> {
        let value = serde::Value::deserialize(deserializer)?;
        let discriminant = value.get("kind")
        .and_then(serde::Value::as_str)
        .ok_or_else(|| de::Error::missing_field("kind"))?;
        match discriminant {
          "square" => {
            let v = shared::Square::deserialize(value).map_err(de::Error::custom)?;
            Ok(Output_Shape::KindSquare(v))
          }
          "circle" => {
            let v = Output_Shape_KindCircle::deserialize(value).map_err(de::Error::custom)?;
            Ok(Output_Shape::KindCircle(v))
          }
          other => Err(de::Error::unknown_variant(other, &["square", "circle"])),
        }
      }
    }

    // Exported as 'Schema.MyTemplate.Output_Shape_KindCircle'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct Output_Shape_KindCircle {
      pub radius: f64,
    }

    impl Serialize for Output_Shape_KindCircle {
      fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: Serializer {
        let mut state = serializer.serialize_struct("Output_Shape_KindCircle", 2)?;
        state.serialize_field("kind", "circle")?;
        state.serialize_field("radius", &self.radius)?;
        state.end()
      }
    }
  }

  pub mod MyOtherTemplate {
    // Exported as 'Schema.MyOtherTemplate.Output'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct Output {
      #[serde(rename = "reversedText")]
      pub reversed_text: String,
      pub shape: Output_Shape,
    }

    // Exported as 'Schema.MyOtherTemplate.Output_Shape'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    enum Output_Shape {
      KindSquare(shared::Square),
      KindCircle(Output_Shape_KindCircle),
    }

    impl Serialize for Output_Shape {
      fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S : Serializer {
        match self {
          Output_Shape::KindSquare(v) => v.serialize(serializer),
          Output_Shape::KindCircle(v) => v.serialize(serializer),
        }
      }
    }

    impl<'de> Deserialize<'de> for Output_Shape {
      fn deserialize<D>(deserializer: D) -> Result<Self, D::Error> where D : Deserializer<'de> {
        let value = serde::Value::deserialize(deserializer)?;
        let discriminant = value.get("kind")
        .and_then(serde::Value::as_str)
        .ok_or_else(|| de::Error::missing_field("kind"))?;
        match discriminant {
          "square" => {
            let v = shared::Square::deserialize(value).map_err(de::Error::custom)?;
            Ok(Output_Shape::KindSquare(v))
          }
          "circle" => {
            let v = Output_Shape_KindCircle::deserialize(value).map_err(de::Error::custom)?;
            Ok(Output_Shape::KindCircle(v))
          }
          other => Err(de::Error::unknown_variant(other, &["square", "circle"])),
        }
      }
    }

    // Exported as 'Schema.MyOtherTemplate.Output_Shape_KindCircle'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct Output_Shape_KindCircle {
      pub radius: f64,
    }

    impl Serialize for Output_Shape_KindCircle {
      fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: Serializer {
        let mut state = serializer.serialize_struct("Output_Shape_KindCircle", 2)?;
        state.serialize_field("kind", "circle")?;
        state.serialize_field("radius", &self.radius)?;
        state.end()
      }
    }
  }

  pub mod MyTool {
    // Exported as 'Schema.MyTool.Output'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct Output {
      pub shared: Shared,
    }

    // Exported as 'Schema.MyTool.Shared'
    #[derive(Serialize, Deserialize, Debug, PartialEq)]
    struct Shared {
      pub value: String,
      pub square: shared::Square,
    }
  }
}

