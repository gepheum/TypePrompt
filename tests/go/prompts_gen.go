package typeprompt

// An expression
type Shared_Expr struct{}

type Shared_Expr_KindNumber struct {
	Value string
}

type Shared_Expr_KindAdd struct {
	Left  string
	Right string
}

type Shared_Expr_KindIf struct {
	Condition string
	Then      string
	Else      string
}

type Shared_EnumWithCommonFields struct{}

type Shared_EnumWithCommonFields_NotSuccess struct {
	// x coordinate
	X string
	// y coordinate
	Y string
	// z coordinate
	Z string
}

type Shared_EnumWithCommonFields_Success struct {
	// x coordinate
	X string
	Y string
	Z string
}

type Shared_Schema struct {
	E string
}

type Shared_String struct{}

type Shared_Boolean struct{}

type Shared_List struct{}

type Shared_Map struct{}

type Shared_EncodeDefault struct{}

type Shared_Serializable struct{}

type Shared_KindAdd struct{}

type Shared_AnyHolder struct {
	Any string
}

type Shared_SerializerHolder struct {
	Serializer string
}

type Shared_Square struct {
	Size     string
	FromJson string
	Self     string
}

type Shared_E string

const (
	Shared_E_Class  Shared_E = "class"
	Shared_E_If     Shared_E = "if"
	Shared_E_FooBar Shared_E = "foo-BAR"
)

type Shared_Matrix struct {
	Matrix      string
	OtherMatrix string
	Foo         string
	Ints        string
	Init        string
	Encode      string
}

type Shared_MatrixUnion struct{}

type Shared_MatrixUnion_KindEmpty struct {
	Init   string
	Encode string
	Matrix string
	Foo    string
}

type Shared_DiscriminatorCodingKeys struct{}

type MyTemplate_Input struct {
	Text string
}

type MyTemplate_Output struct {
	ReversedText string
	Shape        string
}

type MyTemplate_Output_Shape struct{}

type MyTemplate_Output_Shape_KindCircle struct {
	Radius string
}

type MyOtherTemplate_Output struct {
	ReversedText string
	Shape        string
}

type MyOtherTemplate_Output_Shape struct{}

type MyOtherTemplate_Output_Shape_KindCircle struct {
	Radius string
}

type AnalyzeSalesData_SalesRow struct {
	Product      string
	Units        string
	RevenueCents string
	Region       string
}

type AnalyzeSalesData_Input struct {
	Rows     string
	Question string
	Variant  string
}

type AnalyzeSalesData_Input_Variant string

const (
	AnalyzeSalesData_Input_Variant_Csv AnalyzeSalesData_Input_Variant = "csv"
	AnalyzeSalesData_Input_Variant_Tsv AnalyzeSalesData_Input_Variant = "tsv"
)

type AnalyzeSalesData_Output struct {
	Analysis     string
	TopProduct   string
	TotalRevenue string
}

type MyTool_Output struct {
	Shared string
}

type MyTool_Shared struct {
	Value  string
	Square string
}

type MyOtherTool_Output struct {
	Shared string
}

type MyOtherTool_Shared struct {
	Value  string
	Square string
}
