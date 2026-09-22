package typeprompt

// An expression
type Shared_Expr struct {}

type Shared_Expr_KindNumber struct {
  Value float64
}

type Shared_Expr_KindAdd struct {
  Left Shared_Expr
  Right Shared_Expr
}

type Shared_Expr_KindIf struct {
  Condition Shared_Expr
  Then Shared_Expr
  Else Shared_Expr
}

type Shared_EnumWithCommonFields struct {}

type Shared_EnumWithCommonFields_NotSuccess struct {
  // x coordinate
  X int
  // y coordinate
  Y float64
  // z coordinate
  Z string
}

type Shared_EnumWithCommonFields_Success struct {
  // x coordinate
  X int
  Y float64
  Z int
}

type Shared_Schema struct {
  E Shared_EnumWithCommonFields
}

type Shared_String struct {}

type Shared_Boolean struct {}

type Shared_List struct {}

type Shared_Map struct {}

type Shared_EncodeDefault struct {}

type Shared_Serializable struct {}

type Shared_KindAdd struct {}

type Shared_AnyHolder struct {
  Any any
}

type Shared_SerializerHolder struct {
  Serializer any
}

type Shared_Square struct {
  Size float64
  FromJson string
  Self string
}

type Shared_E string

const (
  Shared_E_Class Shared_E = "class"
  Shared_E_If Shared_E = "if"
  Shared_E_FooBar Shared_E = "foo-BAR"
)

type Shared_Matrix struct {
  Matrix [][]Shared_Square
  OtherMatrix *[][]Shared_Square
  Foo *map[string][]Shared_Square
  Ints []int
  Init bool
  Encode bool
}

type Shared_MatrixUnion struct {}

type Shared_MatrixUnion_KindEmpty struct {
  Init bool
  Encode bool
  Matrix [][]Shared_Square
  Foo string
}

type Shared_DiscriminatorCodingKeys struct {}

type MyTemplate_Input struct {
  Text string
}

type MyTemplate_Output struct {
  ReversedText string
  Shape MyTemplate_Output_Shape
}

type MyTemplate_Output_Shape struct {}

type MyTemplate_Output_Shape_KindCircle struct {
  Radius float64
}

type MyOtherTemplate_Output struct {
  ReversedText string
  Shape MyOtherTemplate_Output_Shape
}

type MyOtherTemplate_Output_Shape struct {}

type MyOtherTemplate_Output_Shape_KindCircle struct {
  Radius float64
}

type AnalyzeSalesData_SalesRow struct {
  Product string
  Units int
  RevenueCents int
  Region string
}

type AnalyzeSalesData_Input struct {
  Rows []AnalyzeSalesData_SalesRow
  Question string
  Variant AnalyzeSalesData_Input_Variant
}

type AnalyzeSalesData_Input_Variant string

const (
  AnalyzeSalesData_Input_Variant_Csv AnalyzeSalesData_Input_Variant = "csv"
  AnalyzeSalesData_Input_Variant_Tsv AnalyzeSalesData_Input_Variant = "tsv"
)

type AnalyzeSalesData_Output struct {
  Analysis string
  TopProduct string
  TotalRevenue float64
}

type MyTool_Output struct {
  Shared MyTool_Shared
}

type MyTool_Shared struct {
  Value string
  Square Shared_Square
}

type MyOtherTool_Output struct {
  Shared MyOtherTool_Shared
}

type MyOtherTool_Shared struct {
  Value string
  Square Shared_Square
}

