#include "runtime_logic.h"

#include <cmath>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <string>
#include <utility>
#include <vector>

#define ASSERT_EQ(actual, expected)                                              \
  do {                                                                           \
    if ((actual) != (expected)) {                                                \
      std::cerr << "Assertion failed at " << __FILE__ << ":" << __LINE__ << "\n" \
                << "  Expected: " << (expected) << "\n"                          \
                << "  Actual:   " << (actual) << "\n";                           \
      std::abort();                                                              \
    }                                                                            \
  } while (0)

namespace {

using typeprompt::JsonNode;

void TestStringifyNull() {
  JsonNode default_null;
  ASSERT_EQ(default_null.Stringify(), "null");

  JsonNode explicit_null(std::nullopt);
  ASSERT_EQ(explicit_null.Stringify(), "null");
}

void TestStringifyBool() {
  JsonNode bool_true(true);
  ASSERT_EQ(bool_true.Stringify(), "true");

  JsonNode bool_false(false);
  ASSERT_EQ(bool_false.Stringify(), "false");
}

void TestStringifyNumber() {
  JsonNode num_zero(0.0);
  ASSERT_EQ(num_zero.Stringify(), std::to_string(0.0));

  JsonNode num_pos(42.5);
  ASSERT_EQ(num_pos.Stringify(), std::to_string(42.5));

  JsonNode num_neg(-17.25);
  ASSERT_EQ(num_neg.Stringify(), std::to_string(-17.25));

  JsonNode num_nan(std::numeric_limits<double>::quiet_NaN());
  ASSERT_EQ(num_nan.Stringify(), std::to_string(0.0));

  JsonNode num_pos_inf(std::numeric_limits<double>::infinity());
  ASSERT_EQ(num_pos_inf.Stringify(), std::to_string(std::numeric_limits<double>::max()));

  JsonNode num_neg_inf(-std::numeric_limits<double>::infinity());
  ASSERT_EQ(num_neg_inf.Stringify(), std::to_string(std::numeric_limits<double>::min()));
}

void TestStringifyString() {
  JsonNode empty_str(std::string(""));
  ASSERT_EQ(empty_str.Stringify(), "\"\"");

  JsonNode simple_str(std::string("hello world"));
  ASSERT_EQ(simple_str.Stringify(), "\"hello world\"");

  JsonNode quotes_and_backslash(std::string("quote: \", backslash: \\"));
  ASSERT_EQ(quotes_and_backslash.Stringify(), "\"quote: \\\", backslash: \\\\\"");

  JsonNode escape_chars(std::string("line1\nline2\ttab\rcarriage\bback\ffeed"));
  ASSERT_EQ(escape_chars.Stringify(), "\"line1\\nline2\\ttab\\rcarriage\\bback\\ffeed\"");

  std::string with_null("null\0byte", 9);
  JsonNode null_char_str(with_null);
  ASSERT_EQ(null_char_str.Stringify(), "\"null\\u0000byte\"");

  JsonNode hex_ctrl(std::string("\x01\x1f", 2));
  ASSERT_EQ(hex_ctrl.Stringify(), "\"\\u0001\\u001F\"");

  JsonNode unicode_str(std::string("Hello, 世界! 🌍"));
  ASSERT_EQ(unicode_str.Stringify(), "\"Hello, 世界! 🌍\"");

  JsonNode invalid_utf8(
      std::string("abc\xFF"
                  "def"));
  ASSERT_EQ(invalid_utf8.Stringify(),
            "\"abc\xEF\xBF\xBD"
            "def\"");
}

void TestStringifyArray() {
  JsonNode empty_arr(std::vector<JsonNode>{});
  ASSERT_EQ(empty_arr.Stringify(), "[]");

  JsonNode single_arr(std::vector<JsonNode>{JsonNode(std::string("first"))});
  ASSERT_EQ(single_arr.Stringify(), "[\"first\"]");

  JsonNode multi_arr(std::vector<JsonNode>{
      JsonNode(std::nullopt),
      JsonNode(true),
      JsonNode(12.0),
      JsonNode(std::string("text")),
  });
  ASSERT_EQ(multi_arr.Stringify(), "[null,true," + std::to_string(12.0) + ",\"text\"]");

  JsonNode nested_arr(std::vector<JsonNode>{
      JsonNode(std::vector<JsonNode>{JsonNode(1.0), JsonNode(2.0)}),
      JsonNode(std::vector<JsonNode>{}),
      JsonNode(std::vector<JsonNode>{JsonNode(std::vector<JsonNode>{JsonNode(3.0)})}),
  });
  ASSERT_EQ(nested_arr.Stringify(), "[[" + std::to_string(1.0) + "," + std::to_string(2.0) +
                                        "],[],[[" + std::to_string(3.0) + "]]]");
}

void TestStringifyObject() {
  JsonNode empty_obj(std::vector<std::pair<std::string, JsonNode>>{});
  ASSERT_EQ(empty_obj.Stringify(), "{}");

  JsonNode single_obj(
      std::vector<std::pair<std::string, JsonNode>>{{"key", JsonNode(std::string("value"))}});
  ASSERT_EQ(single_obj.Stringify(), "{\"key\": \"value\"}");

  JsonNode multi_obj(std::vector<std::pair<std::string, JsonNode>>{
      {"name", JsonNode(std::string("Alice"))},
      {"age", JsonNode(30.0)},
      {"active", JsonNode(true)},
      {"extra", JsonNode(std::nullopt)},
  });
  ASSERT_EQ(multi_obj.Stringify(), "{\"name\": \"Alice\",\"age\": " + std::to_string(30.0) +
                                       ",\"active\": true,\"extra\": null}");

  JsonNode special_key(std::vector<std::pair<std::string, JsonNode>>{
      {"key\n\"quoted\"", JsonNode(std::string("val"))}});
  ASSERT_EQ(special_key.Stringify(), "{\"key\\n\\\"quoted\\\"\": \"val\"}");

  JsonNode nested_obj(std::vector<std::pair<std::string, JsonNode>>{
      {"outer", JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                    {"inner", JsonNode(std::string("leaf"))}})},
      {"empty", JsonNode(std::vector<std::pair<std::string, JsonNode>>{})},
  });
  ASSERT_EQ(nested_obj.Stringify(), "{\"outer\": {\"inner\": \"leaf\"},\"empty\": {}}");
}

void TestStringifyNestedComplex() {
  JsonNode complex_node(std::vector<std::pair<std::string, JsonNode>>{
      {"title", JsonNode(std::string("Task List"))},
      {"tasks", JsonNode(std::vector<JsonNode>{
                    JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                        {"id", JsonNode(1.0)},
                        {"tags", JsonNode(std::vector<JsonNode>{
                                     JsonNode(std::string("c++")),
                                     JsonNode(std::string("json")),
                                 })},
                    }),
                    JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                        {"id", JsonNode(2.0)},
                        {"tags", JsonNode(std::vector<JsonNode>{})},
                    }),
                })},
      {"completed", JsonNode(false)},
  });

  std::string expected =
      "{\"title\": \"Task List\","
      "\"tasks\": ["
      "{\"id\": " +
      std::to_string(1.0) +
      ",\"tags\": [\"c++\",\"json\"]},"
      "{\"id\": " +
      std::to_string(2.0) +
      ",\"tags\": []}"
      "],"
      "\"completed\": false}";
  ASSERT_EQ(complex_node.Stringify(), expected);
}

void TestStringifyWithIndentNull() {
  JsonNode default_null;
  ASSERT_EQ(default_null.StringifyWithIndent(), "null");

  JsonNode explicit_null(std::nullopt);
  ASSERT_EQ(explicit_null.StringifyWithIndent(), "null");
}

void TestStringifyWithIndentBool() {
  JsonNode bool_true(true);
  ASSERT_EQ(bool_true.StringifyWithIndent(), "true");

  JsonNode bool_false(false);
  ASSERT_EQ(bool_false.StringifyWithIndent(), "false");
}

void TestStringifyWithIndentNumber() {
  JsonNode num(42.0);
  ASSERT_EQ(num.StringifyWithIndent(), std::to_string(42.0));

  JsonNode num_nan(std::numeric_limits<double>::quiet_NaN());
  ASSERT_EQ(num_nan.StringifyWithIndent(), std::to_string(0.0));
}

void TestStringifyWithIndentString() {
  JsonNode str(std::string("hello\nworld"));
  ASSERT_EQ(str.StringifyWithIndent(), "\"hello\\nworld\"");
}

void TestStringifyWithIndentArray() {
  JsonNode empty_arr(std::vector<JsonNode>{});
  ASSERT_EQ(empty_arr.StringifyWithIndent(), "[]");

  JsonNode single_arr(std::vector<JsonNode>{JsonNode(std::string("first"))});
  ASSERT_EQ(single_arr.StringifyWithIndent(),
            "[\n"
            "  \"first\"\n"
            "]");

  JsonNode multi_arr(std::vector<JsonNode>{
      JsonNode(1.0),
      JsonNode(std::string("two")),
      JsonNode(true),
  });
  std::string expected_multi =
      "[\n"
      "  " +
      std::to_string(1.0) +
      ",\n"
      "  \"two\",\n"
      "  true\n"
      "]";
  ASSERT_EQ(multi_arr.StringifyWithIndent(), expected_multi);

  JsonNode nested_arr(std::vector<JsonNode>{
      JsonNode(std::vector<JsonNode>{
          JsonNode(1.0),
          JsonNode(2.0),
      }),
      JsonNode(std::vector<JsonNode>{}),
      JsonNode(std::vector<JsonNode>{
          JsonNode(std::vector<JsonNode>{
              JsonNode(3.0),
          }),
      }),
  });
  std::string expected_nested =
      "[\n"
      "  [\n"
      "    " +
      std::to_string(1.0) +
      ",\n"
      "    " +
      std::to_string(2.0) +
      "\n"
      "  ],\n"
      "  [],\n"
      "  [\n"
      "    [\n"
      "      " +
      std::to_string(3.0) +
      "\n"
      "    ]\n"
      "  ]\n"
      "]";
  ASSERT_EQ(nested_arr.StringifyWithIndent(), expected_nested);
}

void TestStringifyWithIndentObject() {
  JsonNode empty_obj(std::vector<std::pair<std::string, JsonNode>>{});
  ASSERT_EQ(empty_obj.StringifyWithIndent(), "{}");

  JsonNode single_obj(
      std::vector<std::pair<std::string, JsonNode>>{{"key", JsonNode(std::string("value"))}});
  ASSERT_EQ(single_obj.StringifyWithIndent(),
            "{\n"
            "  \"key\": \"value\"\n"
            "}");

  JsonNode multi_obj(std::vector<std::pair<std::string, JsonNode>>{
      {"name", JsonNode(std::string("Alice"))},
      {"age", JsonNode(30.0)},
      {"active", JsonNode(true)},
  });
  std::string expected_multi =
      "{\n"
      "  \"name\": \"Alice\",\n"
      "  \"age\": " +
      std::to_string(30.0) +
      ",\n"
      "  \"active\": true\n"
      "}";
  ASSERT_EQ(multi_obj.StringifyWithIndent(), expected_multi);

  JsonNode nested_obj(std::vector<std::pair<std::string, JsonNode>>{
      {"outer", JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                    {"inner", JsonNode(std::string("leaf"))}})},
      {"empty", JsonNode(std::vector<std::pair<std::string, JsonNode>>{})},
  });
  std::string expected_nested =
      "{\n"
      "  \"outer\": {\n"
      "    \"inner\": \"leaf\"\n"
      "  },\n"
      "  \"empty\": {}\n"
      "}";
  ASSERT_EQ(nested_obj.StringifyWithIndent(), expected_nested);
}

void TestStringifyWithIndentNestedComplex() {
  JsonNode complex_node(std::vector<std::pair<std::string, JsonNode>>{
      {"title", JsonNode(std::string("Task List"))},
      {"tasks", JsonNode(std::vector<JsonNode>{
                    JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                        {"id", JsonNode(1.0)},
                        {"tags", JsonNode(std::vector<JsonNode>{
                                     JsonNode(std::string("c++")),
                                     JsonNode(std::string("json")),
                                 })},
                    }),
                    JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                        {"id", JsonNode(2.0)},
                        {"tags", JsonNode(std::vector<JsonNode>{})},
                    }),
                })},
      {"completed", JsonNode(false)},
  });

  std::string expected =
      "{\n"
      "  \"title\": \"Task List\",\n"
      "  \"tasks\": [\n"
      "    {\n"
      "      \"id\": " +
      std::to_string(1.0) +
      ",\n"
      "      \"tags\": [\n"
      "        \"c++\",\n"
      "        \"json\"\n"
      "      ]\n"
      "    },\n"
      "    {\n"
      "      \"id\": " +
      std::to_string(2.0) +
      ",\n"
      "      \"tags\": []\n"
      "    }\n"
      "  ],\n"
      "  \"completed\": false\n"
      "}";
  ASSERT_EQ(complex_node.StringifyWithIndent(), expected);
}

}  // namespace

void TestRuntimeLogic() {
  TestStringifyNull();
  TestStringifyBool();
  TestStringifyNumber();
  TestStringifyString();
  TestStringifyArray();
  TestStringifyObject();
  TestStringifyNestedComplex();

  TestStringifyWithIndentNull();
  TestStringifyWithIndentBool();
  TestStringifyWithIndentNumber();
  TestStringifyWithIndentString();
  TestStringifyWithIndentArray();
  TestStringifyWithIndentObject();
  TestStringifyWithIndentNestedComplex();
}

int main() {
  std::cout << "Running C++ runtime logic tests...\n";
  TestRuntimeLogic();
  std::cout << "All C++ tests passed.\n";
  return 0;
}
