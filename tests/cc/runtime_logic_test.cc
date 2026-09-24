#include "runtime_logic.h"

#include <cstdlib>
#include <iostream>
#include <limits>
#include <string>
#include <unordered_map>
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

#define ASSERT_TRUE(condition)                                                   \
  do {                                                                           \
    if (!(condition)) {                                                          \
      std::cerr << "Assertion failed at " << __FILE__ << ":" << __LINE__ << "\n" \
                << "  Expected true, got false: " #condition "\n";               \
      std::abort();                                                              \
    }                                                                            \
  } while (0)

#define ASSERT_FALSE(condition)                                                  \
  do {                                                                           \
    if (condition) {                                                             \
      std::cerr << "Assertion failed at " << __FILE__ << ":" << __LINE__ << "\n" \
                << "  Expected false, got true: " #condition "\n";               \
      std::abort();                                                              \
    }                                                                            \
  } while (0)

namespace {

using typeprompt::JsonNode;
using typeprompt::ParseError;
using typeprompt::ParseResult;

inline std::ostream& operator<<(std::ostream& os, JsonNode::Type type) {
  switch (type) {
    case JsonNode::Type::kNull:
      return os << "kNull";
    case JsonNode::Type::kBool:
      return os << "kBool";
    case JsonNode::Type::kNumber:
      return os << "kNumber";
    case JsonNode::Type::kString:
      return os << "kString";
    case JsonNode::Type::kArray:
      return os << "kArray";
    case JsonNode::Type::kObject:
      return os << "kObject";
  }
  return os << "Unknown";
}

void TestToJsonNull() {
  JsonNode default_null;
  ASSERT_EQ(default_null.ToJson(), "null");

  JsonNode explicit_null(std::nullopt);
  ASSERT_EQ(explicit_null.ToJson(), "null");
}

void TestToJsonBool() {
  JsonNode bool_true(true);
  ASSERT_EQ(bool_true.ToJson(), "true");

  JsonNode bool_false(false);
  ASSERT_EQ(bool_false.ToJson(), "false");
}

void TestToJsonNumber() {
  JsonNode num_zero(0.0);
  ASSERT_EQ(num_zero.ToJson(), std::to_string(0.0));

  JsonNode num_pos(42.5);
  ASSERT_EQ(num_pos.ToJson(), std::to_string(42.5));

  JsonNode num_neg(-17.25);
  ASSERT_EQ(num_neg.ToJson(), std::to_string(-17.25));

  JsonNode num_nan(std::numeric_limits<double>::quiet_NaN());
  ASSERT_EQ(num_nan.ToJson(), std::to_string(0.0));

  JsonNode num_pos_inf(std::numeric_limits<double>::infinity());
  ASSERT_EQ(num_pos_inf.ToJson(), std::to_string(std::numeric_limits<double>::max()));

  JsonNode num_neg_inf(-std::numeric_limits<double>::infinity());
  ASSERT_EQ(num_neg_inf.ToJson(), std::to_string(std::numeric_limits<double>::min()));
}

void TestToJsonString() {
  JsonNode empty_str(std::string(""));
  ASSERT_EQ(empty_str.ToJson(), "\"\"");

  JsonNode simple_str(std::string("hello world"));
  ASSERT_EQ(simple_str.ToJson(), "\"hello world\"");

  JsonNode quotes_and_backslash(std::string("quote: \", backslash: \\"));
  ASSERT_EQ(quotes_and_backslash.ToJson(), "\"quote: \\\", backslash: \\\\\"");

  JsonNode escape_chars(std::string("line1\nline2\ttab\rcarriage\bback\ffeed"));
  ASSERT_EQ(escape_chars.ToJson(), "\"line1\\nline2\\ttab\\rcarriage\\bback\\ffeed\"");

  std::string with_null("null\0byte", 9);
  JsonNode null_char_str(with_null);
  ASSERT_EQ(null_char_str.ToJson(), "\"null\\u0000byte\"");

  JsonNode hex_ctrl(std::string("\x01\x1f", 2));
  ASSERT_EQ(hex_ctrl.ToJson(), "\"\\u0001\\u001F\"");

  JsonNode unicode_str(std::string("Hello, 世界! 🌍"));
  ASSERT_EQ(unicode_str.ToJson(), "\"Hello, 世界! 🌍\"");

  JsonNode invalid_utf8(
      std::string("abc\xFF"
                  "def"));
  ASSERT_EQ(invalid_utf8.ToJson(),
            "\"abc\xEF\xBF\xBD"
            "def\"");

  // Direct std::string_view construction
  JsonNode sv_node(std::string_view("sv_test"));
  ASSERT_EQ(sv_node.string_value(), "sv_test");

  std::string full = "prefix_target_suffix";
  std::string_view sub(full.data() + 7, 6);
  JsonNode sub_node(sub);
  ASSERT_EQ(sub_node.string_value(), "target");

  // Non-null-terminated string_view with incomplete multi-byte at boundary
  char raw_bytes[] = {'h', 'e', 'l', 'l', 'o', static_cast<char>(0xC0), 'x'};
  std::string_view partial_sv(raw_bytes, 6);
  JsonNode partial_node(partial_sv);
  ASSERT_EQ(partial_node.string_value(), "hello\xEF\xBF\xBD");
}

void TestToJsonArray() {
  JsonNode empty_arr(std::vector<JsonNode>{});
  ASSERT_EQ(empty_arr.ToJson(), "[]");

  JsonNode single_arr(std::vector<JsonNode>{JsonNode(std::string("first"))});
  ASSERT_EQ(single_arr.ToJson(), "[\"first\"]");

  JsonNode multi_arr(std::vector<JsonNode>{
      JsonNode(std::nullopt),
      JsonNode(true),
      JsonNode(12.0),
      JsonNode(std::string("text")),
  });
  ASSERT_EQ(multi_arr.ToJson(), "[null,true," + std::to_string(12.0) + ",\"text\"]");

  JsonNode nested_arr(std::vector<JsonNode>{
      JsonNode(std::vector<JsonNode>{JsonNode(1.0), JsonNode(2.0)}),
      JsonNode(std::vector<JsonNode>{}),
      JsonNode(std::vector<JsonNode>{JsonNode(std::vector<JsonNode>{JsonNode(3.0)})}),
  });
  ASSERT_EQ(nested_arr.ToJson(), "[[" + std::to_string(1.0) + "," + std::to_string(2.0) +
                                     "],[],[[" + std::to_string(3.0) + "]]]");
}

void TestToJsonObject() {
  JsonNode empty_obj(std::vector<std::pair<std::string, JsonNode>>{});
  ASSERT_EQ(empty_obj.ToJson(), "{}");

  JsonNode single_obj(
      std::vector<std::pair<std::string, JsonNode>>{{"key", JsonNode(std::string("value"))}});
  ASSERT_EQ(single_obj.ToJson(), "{\"key\": \"value\"}");

  JsonNode multi_obj(std::vector<std::pair<std::string, JsonNode>>{
      {"name", JsonNode(std::string("Alice"))},
      {"age", JsonNode(30.0)},
      {"active", JsonNode(true)},
      {"extra", JsonNode(std::nullopt)},
  });
  ASSERT_EQ(multi_obj.ToJson(), "{\"name\": \"Alice\",\"age\": " + std::to_string(30.0) +
                                    ",\"active\": true,\"extra\": null}");

  JsonNode special_key(std::vector<std::pair<std::string, JsonNode>>{
      {"key\n\"quoted\"", JsonNode(std::string("val"))}});
  ASSERT_EQ(special_key.ToJson(), "{\"key\\n\\\"quoted\\\"\": \"val\"}");

  JsonNode nested_obj(std::vector<std::pair<std::string, JsonNode>>{
      {"outer", JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                    {"inner", JsonNode(std::string("leaf"))}})},
      {"empty", JsonNode(std::vector<std::pair<std::string, JsonNode>>{})},
  });
  ASSERT_EQ(nested_obj.ToJson(), "{\"outer\": {\"inner\": \"leaf\"},\"empty\": {}}");
}

void TestToJsonNestedComplex() {
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
  ASSERT_EQ(complex_node.ToJson(), expected);
}

void TestToJsonWithIndentNull() {
  JsonNode default_null;
  ASSERT_EQ(default_null.ToJsonWithIndent(), "null");

  JsonNode explicit_null(std::nullopt);
  ASSERT_EQ(explicit_null.ToJsonWithIndent(), "null");
}

void TestToJsonWithIndentBool() {
  JsonNode bool_true(true);
  ASSERT_EQ(bool_true.ToJsonWithIndent(), "true");

  JsonNode bool_false(false);
  ASSERT_EQ(bool_false.ToJsonWithIndent(), "false");
}

void TestToJsonWithIndentNumber() {
  JsonNode num(42.0);
  ASSERT_EQ(num.ToJsonWithIndent(), std::to_string(42.0));

  JsonNode num_nan(std::numeric_limits<double>::quiet_NaN());
  ASSERT_EQ(num_nan.ToJsonWithIndent(), std::to_string(0.0));
}

void TestToJsonWithIndentString() {
  JsonNode str(std::string("hello\nworld"));
  ASSERT_EQ(str.ToJsonWithIndent(), "\"hello\\nworld\"");
}

void TestToJsonWithIndentArray() {
  JsonNode empty_arr(std::vector<JsonNode>{});
  ASSERT_EQ(empty_arr.ToJsonWithIndent(), "[]");

  JsonNode single_arr(std::vector<JsonNode>{JsonNode(std::string("first"))});
  ASSERT_EQ(single_arr.ToJsonWithIndent(),
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
  ASSERT_EQ(multi_arr.ToJsonWithIndent(), expected_multi);

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
  ASSERT_EQ(nested_arr.ToJsonWithIndent(), expected_nested);
}

void TestToJsonWithIndentObject() {
  JsonNode empty_obj(std::vector<std::pair<std::string, JsonNode>>{});
  ASSERT_EQ(empty_obj.ToJsonWithIndent(), "{}");

  JsonNode single_obj(
      std::vector<std::pair<std::string, JsonNode>>{{"key", JsonNode(std::string("value"))}});
  ASSERT_EQ(single_obj.ToJsonWithIndent(),
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
  ASSERT_EQ(multi_obj.ToJsonWithIndent(), expected_multi);

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
  ASSERT_EQ(nested_obj.ToJsonWithIndent(), expected_nested);
}

void TestToJsonWithIndentNestedComplex() {
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
  ASSERT_EQ(complex_node.ToJsonWithIndent(), expected);
}

void TestToToonPrimitives() {
  JsonNode default_null;
  ASSERT_EQ(default_null.ToToon(), "null");

  JsonNode explicit_null(std::nullopt);
  ASSERT_EQ(explicit_null.ToToon(), "null");

  JsonNode bool_true(true);
  ASSERT_EQ(bool_true.ToToon(), "true");

  JsonNode bool_false(false);
  ASSERT_EQ(bool_false.ToToon(), "false");

  JsonNode str_plain(std::string("hello world"));
  ASSERT_EQ(str_plain.ToToon(), "hello world");

  JsonNode str_with_colon(std::string("hello: world"));
  ASSERT_EQ(str_with_colon.ToToon(), "\"hello: world\"");
}

void TestToToonNumbers() {
  JsonNode num_zero(0.0);
  ASSERT_EQ(num_zero.ToToon(), "0");

  JsonNode num_neg_zero(-0.0);
  ASSERT_EQ(num_neg_zero.ToToon(), "0");

  JsonNode num_int(1.0);
  ASSERT_EQ(num_int.ToToon(), "1");

  JsonNode num_pos(42.5);
  ASSERT_EQ(num_pos.ToToon(), "42.5");

  JsonNode num_neg(-17.25);
  ASSERT_EQ(num_neg.ToToon(), "-17.25");

  JsonNode num_million(1000000.0);
  ASSERT_EQ(num_million.ToToon(), "1000000");

  JsonNode num_micro(0.000001);
  ASSERT_EQ(num_micro.ToToon(), "0.000001");

  JsonNode num_nan(std::numeric_limits<double>::quiet_NaN());
  ASSERT_EQ(num_nan.ToToon(), "null");

  JsonNode num_pos_inf(std::numeric_limits<double>::infinity());
  ASSERT_EQ(num_pos_inf.ToToon(), "null");

  JsonNode num_neg_inf(-std::numeric_limits<double>::infinity());
  ASSERT_EQ(num_neg_inf.ToToon(), "null");
}

void TestToToonStringsAndEscapes() {
  JsonNode empty_str(std::string(""));
  ASSERT_EQ(empty_str.ToToon(), "\"\"");

  JsonNode lead_space(std::string(" leading"));
  ASSERT_EQ(lead_space.ToToon(), "\" leading\"");

  JsonNode trail_space(std::string("trailing "));
  ASSERT_EQ(trail_space.ToToon(), "\"trailing \"");

  JsonNode lead_tab(std::string("\tleading tab"));
  ASSERT_EQ(lead_tab.ToToon(), "\"\\tleading tab\"");

  JsonNode kw_true(std::string("true"));
  ASSERT_EQ(kw_true.ToToon(), "\"true\"");

  JsonNode kw_false(std::string("false"));
  ASSERT_EQ(kw_false.ToToon(), "\"false\"");

  JsonNode kw_null(std::string("null"));
  ASSERT_EQ(kw_null.ToToon(), "\"null\"");

  JsonNode num_str_42(std::string("42"));
  ASSERT_EQ(num_str_42.ToToon(), "\"42\"");

  JsonNode num_str_neg(std::string("-3.14"));
  ASSERT_EQ(num_str_neg.ToToon(), "\"-3.14\"");

  JsonNode num_str_lead_zero(std::string("05"));
  ASSERT_EQ(num_str_lead_zero.ToToon(), "\"05\"");

  JsonNode num_str_plus(std::string("+1"));
  ASSERT_EQ(num_str_plus.ToToon(), "\"+1\"");

  JsonNode num_str_exp(std::string("1e-6"));
  ASSERT_EQ(num_str_exp.ToToon(), "\"1e-6\"");

  JsonNode str_dot5(std::string(".5"));
  ASSERT_EQ(str_dot5.ToToon(), ".5");

  JsonNode str_1dot(std::string("1."));
  ASSERT_EQ(str_1dot.ToToon(), "1.");

  JsonNode quotes_and_bs(std::string("quote: \", backslash: \\"));
  ASSERT_EQ(quotes_and_bs.ToToon(), "\"quote: \\\", backslash: \\\\\"");

  JsonNode escapes(std::string("line1\nline2\ttab\rcarriage"));
  ASSERT_EQ(escapes.ToToon(), "\"line1\\nline2\\ttab\\rcarriage\"");

  JsonNode bs_ctrl(std::string("\b", 1));
  ASSERT_EQ(bs_ctrl.ToToon(), "\"\\u0008\"");

  JsonNode ff_ctrl(std::string("\f", 1));
  ASSERT_EQ(ff_ctrl.ToToon(), "\"\\u000c\"");

  JsonNode hex_ctrl(std::string("\x01\x1f", 2));
  ASSERT_EQ(hex_ctrl.ToToon(), "\"\\u0001\\u001f\"");

  std::string with_null("null\0byte", 9);
  JsonNode null_char_str(with_null);
  ASSERT_EQ(null_char_str.ToToon(), "\"null\\u0000byte\"");

  JsonNode unicode_plain(std::string("Hello 世界! 🌍"));
  ASSERT_EQ(unicode_plain.ToToon(), "Hello 世界! 🌍");

  JsonNode unicode_with_comma(std::string("Hello, 世界! 🌍"));
  ASSERT_EQ(unicode_with_comma.ToToon(), "\"Hello, 世界! 🌍\"");

  JsonNode lead_hyphen(std::string("-foo"));
  ASSERT_EQ(lead_hyphen.ToToon(), "\"-foo\"");

  JsonNode bare_hyphen(std::string("-"));
  ASSERT_EQ(bare_hyphen.ToToon(), "\"-\"");

  JsonNode lead_hash(std::string("#comment"));
  ASSERT_EQ(lead_hash.ToToon(), "\"#comment\"");

  JsonNode bare_hash(std::string("#"));
  ASSERT_EQ(bare_hash.ToToon(), "\"#\"");

  JsonNode comma_str(std::string("a,b"));
  ASSERT_EQ(comma_str.ToToon(), "\"a,b\"");
}

void TestToToonKeys() {
  JsonNode safe_keys(std::vector<std::pair<std::string, JsonNode>>{
      {"id", JsonNode(1.0)},
      {"user_name", JsonNode(std::string("Ada"))},
      {"user.name", JsonNode(std::string("Ada"))},
  });
  ASSERT_EQ(safe_keys.ToToon(),
            "id: 1\n"
            "user_name: Ada\n"
            "user.name: Ada");

  JsonNode quoted_keys(std::vector<std::pair<std::string, JsonNode>>{
      {"my-key", JsonNode(1.0)},
      {"123", JsonNode(2.0)},
      {"key:with:colon", JsonNode(3.0)},
      {"key with spaces", JsonNode(4.0)},
  });
  ASSERT_EQ(quoted_keys.ToToon(),
            "\"my-key\": 1\n"
            "\"123\": 2\n"
            "\"key:with:colon\": 3\n"
            "\"key with spaces\": 4");
}

void TestToToonEmptyStructures() {
  JsonNode empty_obj(std::vector<std::pair<std::string, JsonNode>>{});
  ASSERT_EQ(empty_obj.ToToon(), "");

  JsonNode obj_with_empty(std::vector<std::pair<std::string, JsonNode>>{
      {"empty", JsonNode(std::vector<std::pair<std::string, JsonNode>>{})},
  });
  ASSERT_EQ(obj_with_empty.ToToon(), "empty:");

  JsonNode empty_arr(std::vector<JsonNode>{});
  ASSERT_EQ(empty_arr.ToToon(), "[]");

  JsonNode obj_with_empty_arr(std::vector<std::pair<std::string, JsonNode>>{
      {"items", JsonNode(std::vector<JsonNode>{})},
  });
  ASSERT_EQ(obj_with_empty_arr.ToToon(), "items: []");

  JsonNode arr_of_empty_objs(std::vector<JsonNode>{
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{}),
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{}),
  });
  ASSERT_EQ(arr_of_empty_objs.ToToon(),
            "[2]:\n"
            "  -\n"
            "  -");
}

void TestToToonPrimitiveArrays() {
  JsonNode root_arr(std::vector<JsonNode>{
      JsonNode(1.0),
      JsonNode(2.0),
      JsonNode(3.0),
  });
  ASSERT_EQ(root_arr.ToToon(), "[3]: 1,2,3");

  JsonNode field_arr(std::vector<std::pair<std::string, JsonNode>>{
      {"tags", JsonNode(std::vector<JsonNode>{
                   JsonNode(std::string("admin")),
                   JsonNode(std::string("ops")),
                   JsonNode(std::string("dev")),
               })},
  });
  ASSERT_EQ(field_arr.ToToon(), "tags[3]: admin,ops,dev");

  JsonNode arr_with_commas(std::vector<JsonNode>{
      JsonNode(std::string("admin,ops")),
      JsonNode(std::string("dev")),
  });
  ASSERT_EQ(arr_with_commas.ToToon(), "[2]: \"admin,ops\",dev");
}

void TestToToonArraysOfArrays() {
  JsonNode pairs(std::vector<std::pair<std::string, JsonNode>>{
      {"pairs", JsonNode(std::vector<JsonNode>{
                    JsonNode(std::vector<JsonNode>{JsonNode(1.0), JsonNode(2.0)}),
                    JsonNode(std::vector<JsonNode>{JsonNode(3.0), JsonNode(4.0)}),
                })},
  });
  ASSERT_EQ(pairs.ToToon(),
            "pairs[2]:\n"
            "  - [2]: 1,2\n"
            "  - [2]: 3,4");

  JsonNode with_empty_inner(std::vector<JsonNode>{
      JsonNode(std::vector<JsonNode>{JsonNode(1.0), JsonNode(2.0)}),
      JsonNode(std::vector<JsonNode>{}),
  });
  ASSERT_EQ(with_empty_inner.ToToon(),
            "[2]:\n"
            "  - [2]: 1,2\n"
            "  - [0]:");
}

void TestToToonTabularArrays() {
  JsonNode items(std::vector<std::pair<std::string, JsonNode>>{
      {"items", JsonNode(std::vector<JsonNode>{
                    JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                        {"sku", JsonNode(std::string("A1"))},
                        {"qty", JsonNode(2.0)},
                        {"price", JsonNode(9.99)},
                    }),
                    JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                        {"sku", JsonNode(std::string("B2"))},
                        {"qty", JsonNode(1.0)},
                        {"price", JsonNode(14.5)},
                    }),
                })},
  });
  ASSERT_EQ(items.ToToon(),
            "items[2]{sku,qty,price}:\n"
            "  A1,2,9.99\n"
            "  B2,1,14.5");

  JsonNode root_tabular(std::vector<JsonNode>{
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{
          {"sku", JsonNode(std::string("A1"))},
          {"qty", JsonNode(2.0)},
          {"price", JsonNode(9.99)},
      }),
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{
          {"sku", JsonNode(std::string("B2"))},
          {"qty", JsonNode(1.0)},
          {"price", JsonNode(14.5)},
      }),
  });
  ASSERT_EQ(root_tabular.ToToon(),
            "[2]{sku,qty,price}:\n"
            "  A1,2,9.99\n"
            "  B2,1,14.5");

  // Key reordering per first element encounter order
  JsonNode reordered(std::vector<JsonNode>{
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{
          {"a", JsonNode(1.0)},
          {"b", JsonNode(2.0)},
      }),
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{
          {"b", JsonNode(4.0)},
          {"a", JsonNode(3.0)},
      }),
  });
  ASSERT_EQ(reordered.ToToon(),
            "[2]{a,b}:\n"
            "  1,2\n"
            "  3,4");
}

void TestToToonTabularNestedFieldGroups() {
  JsonNode orders(std::vector<std::pair<std::string, JsonNode>>{
      {"orders", JsonNode(std::vector<JsonNode>{
                     JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                         {"id", JsonNode(1.0)},
                         {"customer", JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                                          {"name", JsonNode(std::string("Ada"))},
                                          {"country", JsonNode(std::string("DK"))},
                                      })},
                         {"total", JsonNode(99.0)},
                     }),
                     JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                         {"id", JsonNode(2.0)},
                         {"customer", JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                                          {"name", JsonNode(std::string("Bob"))},
                                          {"country", JsonNode(std::string("UK"))},
                                      })},
                         {"total", JsonNode(149.0)},
                     }),
                 })},
  });
  ASSERT_EQ(orders.ToToon(),
            "orders[2]{id,customer{name,country},total}:\n"
            "  1,Ada,DK,99\n"
            "  2,Bob,UK,149");

  JsonNode multi_nested(std::vector<JsonNode>{
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{
          {"id", JsonNode(1.0)},
          {"loc", JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                      {"geo", JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                                  {"lat", JsonNode(10.0)},
                                  {"lng", JsonNode(20.0)},
                              })},
                  })},
      }),
  });
  ASSERT_EQ(multi_nested.ToToon(),
            "[1]{id,loc{geo{lat,lng}}}:\n"
            "  1,10,20");
}

void TestToToonKeyedTabular() {
  JsonNode root_keyed(std::vector<std::pair<std::string, JsonNode>>{
      {"alice", JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                    {"age", JsonNode(30.0)},
                    {"city", JsonNode(std::string("Berlin"))},
                })},
      {"bob", JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                  {"age", JsonNode(25.0)},
                  {"city", JsonNode(std::string("Oslo"))},
              })},
  });
  ASSERT_EQ(root_keyed.ToToon(),
            "[2:]{age,city}:\n"
            "  alice: 30,Berlin\n"
            "  bob: 25,Oslo");

  JsonNode field_keyed(std::vector<std::pair<std::string, JsonNode>>{
      {"users", root_keyed},
  });
  ASSERT_EQ(field_keyed.ToToon(),
            "users[2:]{age,city}:\n"
            "  alice: 30,Berlin\n"
            "  bob: 25,Oslo");

  // Single-entry object is not keyed tabular
  JsonNode single_entry(std::vector<std::pair<std::string, JsonNode>>{
      {"users", JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                    {"alice", JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                                  {"age", JsonNode(30.0)},
                                  {"city", JsonNode(std::string("Berlin"))},
                              })},
                })},
  });
  ASSERT_EQ(single_entry.ToToon(),
            "users:\n"
            "  alice:\n"
            "    age: 30\n"
            "    city: Berlin");
}

void TestToToonListForm() {
  JsonNode mixed(std::vector<JsonNode>{
      JsonNode(1.0),
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{{"a", JsonNode(1.0)}}),
      JsonNode(std::string("text")),
  });
  ASSERT_EQ(mixed.ToToon(),
            "[3]:\n"
            "  - 1\n"
            "  - a: 1\n"
            "  - text");
}

void TestToToonObjectsAsListItems() {
  JsonNode list_objs(std::vector<JsonNode>{
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{
          {"id", JsonNode(1.0)},
          {"name", JsonNode(std::string("First"))},
      }),
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{
          {"id", JsonNode(2.0)},
          {"name", JsonNode(std::string("Second"))},
          {"extra", JsonNode(true)},
      }),
  });
  ASSERT_EQ(list_objs.ToToon(),
            "[2]:\n"
            "  - id: 1\n"
            "    name: First\n"
            "  - id: 2\n"
            "    name: Second\n"
            "    extra: true");

  JsonNode list_with_nested_obj(std::vector<JsonNode>{
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{
          {"address", JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                          {"city", JsonNode(std::string("Paris"))},
                      })},
          {"country", JsonNode(std::string("FR"))},
      }),
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{
          {"name", JsonNode(std::string("Alice"))},
      }),
  });
  ASSERT_EQ(list_with_nested_obj.ToToon(),
            "[2]:\n"
            "  - address:\n"
            "      city: Paris\n"
            "    country: FR\n"
            "  - name: Alice");
}

void TestToToonObjectsAsListItemsWithTabular() {
  JsonNode items(std::vector<std::pair<std::string, JsonNode>>{
      {"items", JsonNode(std::vector<JsonNode>{
                    JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                        {"users", JsonNode(std::vector<JsonNode>{
                                      JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                                          {"id", JsonNode(1.0)},
                                          {"name", JsonNode(std::string("Ada"))},
                                      }),
                                      JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                                          {"id", JsonNode(2.0)},
                                          {"name", JsonNode(std::string("Bob"))},
                                      }),
                                  })},
                        {"status", JsonNode(std::string("active"))},
                    }),
                })},
  });
  ASSERT_EQ(items.ToToon(),
            "items[1]:\n"
            "  - users[2]{id,name}:\n"
            "      1,Ada\n"
            "      2,Bob\n"
            "    status: active");
}

void TestToToonGeneralObjects() {
  JsonNode obj(std::vector<std::pair<std::string, JsonNode>>{
      {"id", JsonNode(123.0)},
      {"name", JsonNode(std::string("Ada"))},
      {"active", JsonNode(true)},
  });
  ASSERT_EQ(obj.ToToon(),
            "id: 123\n"
            "name: Ada\n"
            "active: true");

  JsonNode nested(std::vector<std::pair<std::string, JsonNode>>{
      {"user", JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                   {"id", JsonNode(123.0)},
                   {"name", JsonNode(std::string("Ada"))},
               })},
  });
  ASSERT_EQ(nested.ToToon(),
            "user:\n"
            "  id: 123\n"
            "  name: Ada");
}

void TestToYamlPrimitives() {
  JsonNode default_null;
  ASSERT_EQ(default_null.ToYaml(), "null");

  JsonNode explicit_null(std::nullopt);
  ASSERT_EQ(explicit_null.ToYaml(), "null");

  JsonNode bool_true(true);
  ASSERT_EQ(bool_true.ToYaml(), "true");

  JsonNode bool_false(false);
  ASSERT_EQ(bool_false.ToYaml(), "false");

  JsonNode str_plain(std::string("hello world"));
  ASSERT_EQ(str_plain.ToYaml(), "hello world");

  JsonNode str_with_colon(std::string("hello: world"));
  ASSERT_EQ(str_with_colon.ToYaml(), "\"hello: world\"");

  JsonNode str_with_hash(std::string("hello # world"));
  ASSERT_EQ(str_with_hash.ToYaml(), "\"hello # world\"");
}

void TestToYamlNumbers() {
  JsonNode num_zero(0.0);
  ASSERT_EQ(num_zero.ToYaml(), "0");

  JsonNode num_neg_zero(-0.0);
  ASSERT_EQ(num_neg_zero.ToYaml(), "0");

  JsonNode num_int(1.0);
  ASSERT_EQ(num_int.ToYaml(), "1");

  JsonNode num_pos(42.5);
  ASSERT_EQ(num_pos.ToYaml(), "42.5");

  JsonNode num_neg(-17.25);
  ASSERT_EQ(num_neg.ToYaml(), "-17.25");

  JsonNode num_million(1000000.0);
  ASSERT_EQ(num_million.ToYaml(), "1000000");

  JsonNode num_micro(0.000001);
  ASSERT_EQ(num_micro.ToYaml(), "0.000001");

  JsonNode num_nan(std::numeric_limits<double>::quiet_NaN());
  ASSERT_EQ(num_nan.ToYaml(), ".nan");

  JsonNode num_pos_inf(std::numeric_limits<double>::infinity());
  ASSERT_EQ(num_pos_inf.ToYaml(), ".inf");

  JsonNode num_neg_inf(-std::numeric_limits<double>::infinity());
  ASSERT_EQ(num_neg_inf.ToYaml(), "-.inf");
}

void TestToYamlStringsAndEscapes() {
  JsonNode empty_str(std::string(""));
  ASSERT_EQ(empty_str.ToYaml(), "\"\"");

  JsonNode lead_space(std::string(" leading"));
  ASSERT_EQ(lead_space.ToYaml(), "\" leading\"");

  JsonNode trail_space(std::string("trailing "));
  ASSERT_EQ(trail_space.ToYaml(), "\"trailing \"");

  JsonNode lead_tab(std::string("\tleading tab"));
  ASSERT_EQ(lead_tab.ToYaml(), "\"\\tleading tab\"");

  JsonNode kw_true(std::string("true"));
  ASSERT_EQ(kw_true.ToYaml(), "\"true\"");

  JsonNode kw_false(std::string("false"));
  ASSERT_EQ(kw_false.ToYaml(), "\"false\"");

  JsonNode kw_null(std::string("null"));
  ASSERT_EQ(kw_null.ToYaml(), "\"null\"");

  JsonNode kw_tilde(std::string("~"));
  ASSERT_EQ(kw_tilde.ToYaml(), "\"~\"");

  JsonNode kw_yes(std::string("yes"));
  ASSERT_EQ(kw_yes.ToYaml(), "\"yes\"");

  JsonNode kw_no(std::string("no"));
  ASSERT_EQ(kw_no.ToYaml(), "\"no\"");

  JsonNode kw_on(std::string("on"));
  ASSERT_EQ(kw_on.ToYaml(), "\"on\"");

  JsonNode kw_off(std::string("off"));
  ASSERT_EQ(kw_off.ToYaml(), "\"off\"");

  JsonNode num_str_42(std::string("42"));
  ASSERT_EQ(num_str_42.ToYaml(), "\"42\"");

  JsonNode num_str_neg(std::string("-3.14"));
  ASSERT_EQ(num_str_neg.ToYaml(), "\"-3.14\"");

  JsonNode num_str_lead_zero(std::string("05"));
  ASSERT_EQ(num_str_lead_zero.ToYaml(), "\"05\"");

  JsonNode num_str_plus(std::string("+1"));
  ASSERT_EQ(num_str_plus.ToYaml(), "\"+1\"");

  JsonNode num_str_exp(std::string("1e-6"));
  ASSERT_EQ(num_str_exp.ToYaml(), "\"1e-6\"");

  JsonNode str_dot5(std::string(".5"));
  ASSERT_EQ(str_dot5.ToYaml(), "\".5\"");

  JsonNode str_nan(std::string(".nan"));
  ASSERT_EQ(str_nan.ToYaml(), "\".nan\"");

  JsonNode str_inf(std::string(".inf"));
  ASSERT_EQ(str_inf.ToYaml(), "\".inf\"");

  JsonNode str_date(std::string("2026-09-23"));
  ASSERT_EQ(str_date.ToYaml(), "\"2026-09-23\"");

  JsonNode quotes_and_bs(std::string("quote: \", backslash: \\"));
  ASSERT_EQ(quotes_and_bs.ToYaml(), "\"quote: \\\", backslash: \\\\\"");

  JsonNode escapes(std::string("line1\nline2\ttab\rcarriage"));
  ASSERT_EQ(escapes.ToYaml(), "\"line1\\nline2\\ttab\\rcarriage\"");

  JsonNode bs_ctrl(std::string("\b", 1));
  ASSERT_EQ(bs_ctrl.ToYaml(), "\"\\b\"");

  JsonNode ff_ctrl(std::string("\f", 1));
  ASSERT_EQ(ff_ctrl.ToYaml(), "\"\\f\"");

  JsonNode hex_ctrl(std::string("\x01\x1f", 2));
  ASSERT_EQ(hex_ctrl.ToYaml(), "\"\\u0001\\u001f\"");

  std::string with_null("null\0byte", 9);
  JsonNode null_char_str(with_null);
  ASSERT_EQ(null_char_str.ToYaml(), "\"null\\0byte\"");

  JsonNode unicode_plain(std::string("Hello 世界! 🌍"));
  ASSERT_EQ(unicode_plain.ToYaml(), "Hello 世界! 🌍");

  JsonNode lead_hyphen(std::string("-foo"));
  ASSERT_EQ(lead_hyphen.ToYaml(), "\"-foo\"");

  JsonNode bare_hyphen(std::string("-"));
  ASSERT_EQ(bare_hyphen.ToYaml(), "\"-\"");

  JsonNode lead_hash(std::string("#comment"));
  ASSERT_EQ(lead_hash.ToYaml(), "\"#comment\"");

  JsonNode bare_hash(std::string("#"));
  ASSERT_EQ(bare_hash.ToYaml(), "\"#\"");

  JsonNode hex_str(std::string("0x1F"));
  ASSERT_EQ(hex_str.ToYaml(), "\"0x1F\"");

  JsonNode oct_str(std::string("0o77"));
  ASSERT_EQ(oct_str.ToYaml(), "\"0o77\"");

  JsonNode bin_str(std::string("0b101"));
  ASSERT_EQ(bin_str.ToYaml(), "\"0b101\"");

  JsonNode at_str(std::string("@admin"));
  ASSERT_EQ(at_str.ToYaml(), "\"@admin\"");

  JsonNode pct_str(std::string("%percent"));
  ASSERT_EQ(pct_str.ToYaml(), "\"%percent\"");

  JsonNode pipe_str(std::string("|pipe"));
  ASSERT_EQ(pipe_str.ToYaml(), "\"|pipe\"");

  JsonNode gt_str(std::string(">greater"));
  ASSERT_EQ(gt_str.ToYaml(), "\">greater\"");

  JsonNode sq_str(std::string("'single'"));
  ASSERT_EQ(sq_str.ToYaml(), "\"'single'\"");

  JsonNode bt_str(std::string("`backtick`"));
  ASSERT_EQ(bt_str.ToYaml(), "\"`backtick`\"");

  JsonNode and_str(std::string("&anchor"));
  ASSERT_EQ(and_str.ToYaml(), "\"&anchor\"");

  JsonNode star_str(std::string("*alias"));
  ASSERT_EQ(star_str.ToYaml(), "\"*alias\"");

  JsonNode excl_str(std::string("!tag"));
  ASSERT_EQ(excl_str.ToYaml(), "\"!tag\"");

  JsonNode qmark_str(std::string("?question"));
  ASSERT_EQ(qmark_str.ToYaml(), "\"?question\"");

  JsonNode colon_end(std::string("end:"));
  ASSERT_EQ(colon_end.ToYaml(), "\"end:\"");

  JsonNode case_kw1(std::string("True"));
  ASSERT_EQ(case_kw1.ToYaml(), "\"True\"");

  JsonNode case_kw2(std::string("FALSE"));
  ASSERT_EQ(case_kw2.ToYaml(), "\"FALSE\"");

  JsonNode case_kw3(std::string("NULL"));
  ASSERT_EQ(case_kw3.ToYaml(), "\"NULL\"");

  JsonNode case_kw4(std::string("Yes"));
  ASSERT_EQ(case_kw4.ToYaml(), "\"Yes\"");

  JsonNode case_kw5(std::string("NO"));
  ASSERT_EQ(case_kw5.ToYaml(), "\"NO\"");

  JsonNode case_kw6(std::string("ON"));
  ASSERT_EQ(case_kw6.ToYaml(), "\"ON\"");

  JsonNode case_kw7(std::string("Off"));
  ASSERT_EQ(case_kw7.ToYaml(), "\"Off\"");

  JsonNode case_kw8(std::string("y"));
  ASSERT_EQ(case_kw8.ToYaml(), "\"y\"");

  JsonNode case_kw9(std::string("N"));
  ASSERT_EQ(case_kw9.ToYaml(), "\"N\"");
}

void TestToYamlKeys() {
  JsonNode safe_keys(std::vector<std::pair<std::string, JsonNode>>{
      {"id", JsonNode(1.0)},
      {"user_name", JsonNode(std::string("Ada"))},
  });
  ASSERT_EQ(safe_keys.ToYaml(),
            "id: 1\n"
            "user_name: Ada");

  JsonNode quoted_keys(std::vector<std::pair<std::string, JsonNode>>{
      {"my-key", JsonNode(1.0)},
      {"123", JsonNode(2.0)},
      {"key:with:colon", JsonNode(3.0)},
      {"key with spaces", JsonNode(4.0)},
      {"true", JsonNode(5.0)},
  });
  ASSERT_EQ(quoted_keys.ToYaml(),
            "\"my-key\": 1\n"
            "\"123\": 2\n"
            "\"key:with:colon\": 3\n"
            "\"key with spaces\": 4\n"
            "\"true\": 5");
}

void TestToYamlEmptyStructures() {
  JsonNode empty_obj(std::vector<std::pair<std::string, JsonNode>>{});
  ASSERT_EQ(empty_obj.ToYaml(), "{}");

  JsonNode empty_arr(std::vector<JsonNode>{});
  ASSERT_EQ(empty_arr.ToYaml(), "[]");

  JsonNode obj_with_empty(std::vector<std::pair<std::string, JsonNode>>{
      {"empty", JsonNode(std::vector<std::pair<std::string, JsonNode>>{})},
      {"items", JsonNode(std::vector<JsonNode>{})},
  });
  ASSERT_EQ(obj_with_empty.ToYaml(),
            "empty: {}\n"
            "items: []");

  JsonNode arr_of_empty_objs(std::vector<JsonNode>{
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{}),
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{}),
  });
  ASSERT_EQ(arr_of_empty_objs.ToYaml(),
            "- {}\n"
            "- {}");

  JsonNode arr_of_empty_arrs(std::vector<JsonNode>{
      JsonNode(std::vector<JsonNode>{}),
      JsonNode(std::vector<JsonNode>{}),
  });
  ASSERT_EQ(arr_of_empty_arrs.ToYaml(),
            "- []\n"
            "- []");
}

void TestToYamlArrays() {
  JsonNode root_arr(std::vector<JsonNode>{
      JsonNode(1.0),
      JsonNode(2.0),
      JsonNode(3.0),
  });
  ASSERT_EQ(root_arr.ToYaml(),
            "- 1\n"
            "- 2\n"
            "- 3");

  JsonNode mixed_arr(std::vector<JsonNode>{
      JsonNode(std::nullopt),
      JsonNode(true),
      JsonNode(12.0),
      JsonNode(std::string("text")),
  });
  ASSERT_EQ(mixed_arr.ToYaml(),
            "- null\n"
            "- true\n"
            "- 12\n"
            "- text");

  JsonNode pairs(std::vector<JsonNode>{
      JsonNode(std::vector<JsonNode>{JsonNode(1.0), JsonNode(2.0)}),
      JsonNode(std::vector<JsonNode>{JsonNode(3.0), JsonNode(4.0)}),
  });
  ASSERT_EQ(pairs.ToYaml(),
            "- - 1\n"
            "  - 2\n"
            "- - 3\n"
            "  - 4");

  JsonNode with_empty_inner(std::vector<JsonNode>{
      JsonNode(std::vector<JsonNode>{JsonNode(1.0), JsonNode(2.0)}),
      JsonNode(std::vector<JsonNode>{}),
  });
  ASSERT_EQ(with_empty_inner.ToYaml(),
            "- - 1\n"
            "  - 2\n"
            "- []");
}

void TestToYamlObjects() {
  JsonNode obj(std::vector<std::pair<std::string, JsonNode>>{
      {"id", JsonNode(123.0)},
      {"name", JsonNode(std::string("Ada"))},
      {"active", JsonNode(true)},
  });
  ASSERT_EQ(obj.ToYaml(),
            "id: 123\n"
            "name: Ada\n"
            "active: true");

  JsonNode nested(std::vector<std::pair<std::string, JsonNode>>{
      {"user", JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                   {"id", JsonNode(123.0)},
                   {"name", JsonNode(std::string("Ada"))},
               })},
      {"empty", JsonNode(std::vector<std::pair<std::string, JsonNode>>{})},
  });
  ASSERT_EQ(nested.ToYaml(),
            "user:\n"
            "  id: 123\n"
            "  name: Ada\n"
            "empty: {}");

  JsonNode with_array(std::vector<std::pair<std::string, JsonNode>>{
      {"tags", JsonNode(std::vector<JsonNode>{
                   JsonNode(std::string("admin")),
                   JsonNode(std::string("ops")),
               })},
      {"empty_list", JsonNode(std::vector<JsonNode>{})},
  });
  ASSERT_EQ(with_array.ToYaml(),
            "tags:\n"
            "  - admin\n"
            "  - ops\n"
            "empty_list: []");

  JsonNode deeply_nested(std::vector<std::pair<std::string, JsonNode>>{
      {"l1", JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                 {"l2", JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                            {"l3", JsonNode(std::string("value"))},
                        })},
             })},
  });
  ASSERT_EQ(deeply_nested.ToYaml(),
            "l1:\n"
            "  l2:\n"
            "    l3: value");
}

void TestToYamlObjectsAsListItems() {
  JsonNode list_objs(std::vector<JsonNode>{
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{
          {"id", JsonNode(1.0)},
          {"name", JsonNode(std::string("First"))},
      }),
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{
          {"id", JsonNode(2.0)},
          {"name", JsonNode(std::string("Second"))},
          {"extra", JsonNode(true)},
      }),
  });
  ASSERT_EQ(list_objs.ToYaml(),
            "- id: 1\n"
            "  name: First\n"
            "- id: 2\n"
            "  name: Second\n"
            "  extra: true");

  JsonNode list_with_nested_obj(std::vector<JsonNode>{
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{
          {"address", JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                          {"city", JsonNode(std::string("Paris"))},
                          {"zip", JsonNode(std::string("75001"))},
                      })},
          {"country", JsonNode(std::string("FR"))},
      }),
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{
          {"name", JsonNode(std::string("Alice"))},
      }),
  });
  ASSERT_EQ(list_with_nested_obj.ToYaml(),
            "- address:\n"
            "    city: Paris\n"
            "    zip: \"75001\"\n"
            "  country: FR\n"
            "- name: Alice");

  JsonNode list_with_nested_arr(std::vector<JsonNode>{
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
  });
  ASSERT_EQ(list_with_nested_arr.ToYaml(),
            "- id: 1\n"
            "  tags:\n"
            "    - c++\n"
            "    - json\n"
            "- id: 2\n"
            "  tags: []");
}

void TestToYamlComplexNested() {
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
      "title: Task List\n"
      "tasks:\n"
      "  - id: 1\n"
      "    tags:\n"
      "      - c++\n"
      "      - json\n"
      "  - id: 2\n"
      "    tags: []\n"
      "completed: false";
  ASSERT_EQ(complex_node.ToYaml(), expected);
}

void TestParseJsonPrimitives() {
  auto r_null = JsonNode::ParseJson("null");
  ASSERT_TRUE(r_null.ok());
  ASSERT_EQ(r_null->type(), JsonNode::Type::kNull);
  ASSERT_EQ(r_null->ToJson(), "null");

  auto r_null_ws = JsonNode::ParseJson("  \t\r\nnull \n ");
  ASSERT_TRUE(r_null_ws.ok());
  ASSERT_EQ(r_null_ws->type(), JsonNode::Type::kNull);

  auto r_true = JsonNode::ParseJson("true");
  ASSERT_TRUE(r_true.ok());
  ASSERT_EQ(r_true->type(), JsonNode::Type::kBool);
  ASSERT_EQ(r_true->bool_value(), true);
  ASSERT_EQ(r_true->ToJson(), "true");

  auto r_false = JsonNode::ParseJson(" \nfalse\t ");
  ASSERT_TRUE(r_false.ok());
  ASSERT_EQ(r_false->type(), JsonNode::Type::kBool);
  ASSERT_EQ(r_false->bool_value(), false);
  ASSERT_EQ(r_false->ToJson(), "false");
}

void TestParseJsonNumbers() {
  auto parse_num = [](std::string_view s) -> double {
    auto r = JsonNode::ParseJson(s);
    ASSERT_TRUE(r.ok());
    ASSERT_EQ(r->type(), JsonNode::Type::kNumber);
    return r->number_value();
  };

  ASSERT_EQ(parse_num("0"), 0.0);
  ASSERT_EQ(parse_num("-0"), -0.0);
  ASSERT_EQ(parse_num("42"), 42.0);
  ASSERT_EQ(parse_num("-17"), -17.0);
  ASSERT_EQ(parse_num("0.5"), 0.5);
  ASSERT_EQ(parse_num("-0.001"), -0.001);
  ASSERT_EQ(parse_num("3.14159"), 3.14159);
  ASSERT_EQ(parse_num("1e6"), 1000000.0);
  ASSERT_EQ(parse_num("1.5e3"), 1500.0);
  ASSERT_EQ(parse_num("1.5e+3"), 1500.0);
  ASSERT_EQ(parse_num("2E-4"), 0.0002);
  ASSERT_EQ(parse_num("-3.5e2"), -350.0);
  ASSERT_EQ(parse_num("1234567890"), 1234567890.0);
}

void TestParseJsonStrings() {
  auto parse_str = [](std::string_view s) -> std::string {
    auto r = JsonNode::ParseJson(s);
    ASSERT_TRUE(r.ok());
    ASSERT_EQ(r->type(), JsonNode::Type::kString);
    return r->string_value();
  };

  ASSERT_EQ(parse_str("\"\""), "");
  ASSERT_EQ(parse_str("\"hello world\""), "hello world");
  ASSERT_EQ(parse_str("\"quote: \\\", backslash: \\\\, slash: \\/\""),
            "quote: \", backslash: \\, slash: /");
  ASSERT_EQ(parse_str("\"\\b\\f\\n\\r\\t\""), "\b\f\n\r\t");
  ASSERT_EQ(parse_str("\"\\u0041\\u0042\""), "AB");
  ASSERT_EQ(parse_str("\"\\u00e9\""), "é");
  ASSERT_EQ(parse_str("\"\\u4e16\\u754c\""), "世界");
  ASSERT_EQ(parse_str("\"\\uD83D\\uDE00\""), "😀");
  ASSERT_EQ(parse_str("\"\\uD83C\\uDF0D\""), "🌍");
  ASSERT_EQ(parse_str("\"\\uD83D\\uDE00 trailing text\""), "😀 trailing text");
  ASSERT_EQ(parse_str("\"Hello, 世界! 🌍\""), "Hello, 世界! 🌍");

  std::string null_byte_str = parse_str("\"null\\u0000byte\"");
  ASSERT_EQ(null_byte_str.size(), 9);
  ASSERT_EQ(null_byte_str, std::string("null\0byte", 9));
}

void TestParseJsonArrays() {
  auto r_empty = JsonNode::ParseJson("[]");
  ASSERT_TRUE(r_empty.ok());
  ASSERT_EQ(r_empty->type(), JsonNode::Type::kArray);
  ASSERT_EQ(r_empty->array_value().size(), 0);

  auto r_empty_ws = JsonNode::ParseJson(" [ \n\t\r ] ");
  ASSERT_TRUE(r_empty_ws.ok());
  ASSERT_EQ(r_empty_ws->array_value().size(), 0);

  auto r_nums = JsonNode::ParseJson("[1, 2, 3]");
  ASSERT_TRUE(r_nums.ok());
  const auto& arr_nums = r_nums->array_value();
  ASSERT_EQ(arr_nums.size(), 3);
  ASSERT_EQ(arr_nums[0].number_value(), 1.0);
  ASSERT_EQ(arr_nums[1].number_value(), 2.0);
  ASSERT_EQ(arr_nums[2].number_value(), 3.0);

  auto r_mixed = JsonNode::ParseJson("[null, true, false, \"text\", 42.5]");
  ASSERT_TRUE(r_mixed.ok());
  const auto& arr_mixed = r_mixed->array_value();
  ASSERT_EQ(arr_mixed.size(), 5);
  ASSERT_EQ(arr_mixed[0].type(), JsonNode::Type::kNull);
  ASSERT_EQ(arr_mixed[1].bool_value(), true);
  ASSERT_EQ(arr_mixed[2].bool_value(), false);
  ASSERT_EQ(arr_mixed[3].string_value(), "text");
  ASSERT_EQ(arr_mixed[4].number_value(), 42.5);

  auto r_nested = JsonNode::ParseJson("[[], [1, [2, [3]]]]");
  ASSERT_TRUE(r_nested.ok());
  const auto& arr_nested = r_nested->array_value();
  ASSERT_EQ(arr_nested.size(), 2);
  ASSERT_EQ(arr_nested[0].array_value().size(), 0);
  ASSERT_EQ(arr_nested[1].array_value()[1].array_value()[1].array_value()[0].number_value(), 3.0);
}

void TestParseJsonObjects() {
  auto r_empty = JsonNode::ParseJson("{}");
  ASSERT_TRUE(r_empty.ok());
  ASSERT_EQ(r_empty->type(), JsonNode::Type::kObject);
  ASSERT_EQ(r_empty->object_value().size(), 0);

  auto r_empty_ws = JsonNode::ParseJson(" { \n\t\r } ");
  ASSERT_TRUE(r_empty_ws.ok());
  ASSERT_EQ(r_empty_ws->object_value().size(), 0);

  auto r_single = JsonNode::ParseJson("{\"key\": \"value\"}");
  ASSERT_TRUE(r_single.ok());
  const auto& obj_single = r_single->object_value();
  ASSERT_EQ(obj_single.size(), 1);
  ASSERT_EQ(obj_single[0].first, "key");
  ASSERT_EQ(obj_single[0].second.string_value(), "value");

  auto r_escaped_keys =
      JsonNode::ParseJson("{\"a/b\": 1, \"c\\\\d\": 2, \"e\\\"f\": 3, \"\\u006b\": 4}");
  ASSERT_TRUE(r_escaped_keys.ok());
  const auto& obj_esc = r_escaped_keys->object_value();
  ASSERT_EQ(obj_esc.size(), 4);
  ASSERT_EQ(obj_esc[0].first, "a/b");
  ASSERT_EQ(obj_esc[1].first, "c\\d");
  ASSERT_EQ(obj_esc[2].first, "e\"f");
  ASSERT_EQ(obj_esc[3].first, "k");

  auto r_multi =
      JsonNode::ParseJson("{\"name\": \"Alice\", \"age\": 30, \"active\": true, \"extra\": null}");
  ASSERT_TRUE(r_multi.ok());
  const auto& obj_multi = r_multi->object_value();
  ASSERT_EQ(obj_multi.size(), 4);
  ASSERT_EQ(obj_multi[0].first, "name");
  ASSERT_EQ(obj_multi[0].second.string_value(), "Alice");
  ASSERT_EQ(obj_multi[1].first, "age");
  ASSERT_EQ(obj_multi[1].second.number_value(), 30.0);
  ASSERT_EQ(obj_multi[2].first, "active");
  ASSERT_EQ(obj_multi[2].second.bool_value(), true);
  ASSERT_EQ(obj_multi[3].first, "extra");
  ASSERT_EQ(obj_multi[3].second.type(), JsonNode::Type::kNull);

  auto r_nested = JsonNode::ParseJson("{\"outer\": {\"inner\": [1, 2, {\"deep\": true}]}}");
  ASSERT_TRUE(r_nested.ok());
  ASSERT_EQ(r_nested->ToJson(), "{\"outer\": {\"inner\": [" + std::to_string(1.0) + "," +
                                    std::to_string(2.0) + ",{\"deep\": true}]}}");
}

void TestParseJsonErrors() {
  auto assert_error = [](std::string_view json) {
    auto r = JsonNode::ParseJson(json);
    ASSERT_FALSE(r.ok());
    ASSERT_FALSE(r.error().message.empty());
  };

  auto assert_error_msg = [](std::string_view json, std::string_view expected_msg) {
    auto r = JsonNode::ParseJson(json);
    ASSERT_FALSE(r.ok());
    ASSERT_EQ(r.error().message, expected_msg);
  };

  // Empty / whitespace only
  assert_error_msg("", "Empty input");
  assert_error_msg("   \t\n\r", "Empty input");

  // Trailing garbage
  assert_error_msg("123 abc", "Unexpected trailing content after JSON value at position 4");
  assert_error_msg("[1] trailing", "Unexpected trailing content after JSON value at position 4");
  assert_error_msg("true false", "Unexpected trailing content after JSON value at position 5");
  assert_error("{} {}");

  // Invalid numbers
  assert_error("+1");
  assert_error(".5");
  assert_error("1.");
  assert_error("01");
  assert_error("-01");
  assert_error("-");
  assert_error("-.5");
  assert_error("1e");
  assert_error("1e+");
  assert_error("1e-");
  assert_error("NaN");
  assert_error("Infinity");
  assert_error("-Infinity");

  // Invalid strings
  assert_error("\"unterminated");
  assert_error("\"bad escape \\a\"");
  assert_error("\"bad escape \\v\"");
  assert_error("\"bad escape \\x20\"");
  assert_error("\"unescaped\nnewline\"");
  assert_error("\"unescaped\tcontrol\"");
  assert_error("\"incomplete unicode \\u\"");
  assert_error("\"incomplete unicode \\u1\"");
  assert_error("\"incomplete unicode \\u12\"");
  assert_error("\"incomplete unicode \\u123\"");
  assert_error("\"invalid hex \\u12G4\"");
  assert_error("\"lone high surrogate \\uD800\"");
  assert_error("\"lone low surrogate \\uDC00\"");
  assert_error("\"high surrogate without low \\uD800\\u0041\"");
  assert_error("\"high surrogate with invalid low \\uD800\\uD800\"");

  // Invalid arrays
  assert_error("[");
  assert_error("[1,");
  assert_error("[1, 2,]");
  assert_error("[ 1 , ]");
  assert_error("[1 2]");
  assert_error("[,]");
  assert_error("[1, 2");

  // Invalid objects
  assert_error("{");
  assert_error("{\"a\": 1,}");
  assert_error("{ \"a\" : 1 , }");
  assert_error("{a: 1}");
  assert_error("{\"a\" 1}");
  assert_error("{\"a\": 1,");
  assert_error("{,}");
  assert_error("{\"key\"}");
  assert_error("{1: 2}");
  assert_error("{\"a\": 1");

  // Invalid tokens
  assert_error("undefined");
  assert_error("tru");
  assert_error("fals");
  assert_error("nul");
}

void TestParseJsonRoundtrip() {
  std::string json_sample =
      "{\"title\": \"Task List\","
      "\"tasks\": ["
      "{\"id\": 1,\"tags\": [\"c++\",\"json\"]},"
      "{\"id\": 2,\"tags\": []}"
      "],"
      "\"completed\": false}";

  auto res = JsonNode::ParseJson(json_sample);
  ASSERT_TRUE(res.ok());
  const auto& node = *res;

  ASSERT_EQ(node.ToJson(),
            "{\"title\": \"Task List\","
            "\"tasks\": ["
            "{\"id\": " +
                std::to_string(1.0) +
                ",\"tags\": [\"c++\",\"json\"]},"
                "{\"id\": " +
                std::to_string(2.0) +
                ",\"tags\": []}"
                "],"
                "\"completed\": false}");

  std::string toon = node.ToToon();
  ASSERT_TRUE(!toon.empty());

  std::string yaml = node.ToYaml();
  ASSERT_TRUE(!yaml.empty());
}

void TestNonZeroTerminatedStringViews() {
  // Construct a buffer without null terminators at slice boundaries
  std::string buffer = "AAAAhelloBBBB\"world\"CCCC12345DDDDtrueEEEE";

  // Slice 1: "hello"
  std::string_view sv_hello(buffer.data() + 4, 5);
  JsonNode node_hello(sv_hello);
  ASSERT_EQ(node_hello.string_value(), "hello");
  ASSERT_EQ(node_hello.ToJson(), "\"hello\"");
  ASSERT_EQ(node_hello.ToToon(), "hello");
  ASSERT_EQ(node_hello.ToYaml(), "hello");

  // Slice 2: "\"world\"" parsed as JSON
  std::string_view sv_world(buffer.data() + 13, 7);
  auto parse_res = JsonNode::ParseJson(sv_world);
  ASSERT_TRUE(parse_res.ok());
  ASSERT_EQ(parse_res->string_value(), "world");

  // Slice 3: "12345" parsed as JSON
  std::string_view sv_num(buffer.data() + 24, 5);
  auto num_res = JsonNode::ParseJson(sv_num);
  ASSERT_TRUE(num_res.ok());
  ASSERT_EQ(num_res->number_value(), 12345.0);

  // Escaping in non-null-terminated slices with control chars
  char raw_ctrl[] = {'X', 'Y', '\n', '\t', '"', '\\', 'Z', 'W'};
  std::string_view sv_ctrl(raw_ctrl + 2, 4);  // "\n\t\"\\"
  JsonNode node_ctrl(sv_ctrl);
  ASSERT_EQ(node_ctrl.ToJson(), "\"\\n\\t\\\"\\\\\"");
  ASSERT_EQ(node_ctrl.ToToon(), "\"\\n\\t\\\"\\\\\"");
  ASSERT_EQ(node_ctrl.ToYaml(), "\"\\n\\t\\\"\\\\\"");
}

void TestDeepNestingProtection() {
  // Test deeply nested arrays (e.g. 1500 levels) to verify no stack overflow
  std::string deep_arr;
  for (int i = 0; i < 1500; ++i) deep_arr += '[';
  for (int i = 0; i < 1500; ++i) deep_arr += ']';

  auto res_arr = JsonNode::ParseJson(deep_arr);
  ASSERT_FALSE(res_arr.ok());
  ASSERT_TRUE(res_arr.error().message.find("maximum nesting depth") != std::string::npos);

  // Deeply nested objects
  std::string deep_obj;
  for (int i = 0; i < 1500; ++i) deep_obj += "{\"k\":";
  deep_obj += "1";
  for (int i = 0; i < 1500; ++i) deep_obj += "}";

  auto res_obj = JsonNode::ParseJson(deep_obj);
  ASSERT_FALSE(res_obj.ok());
  ASSERT_TRUE(res_obj.error().message.find("maximum nesting depth") != std::string::npos);
}

void TestMalformedUtf8AndUnicodeSurrogates() {
  // Truncated multi-byte UTF-8
  ASSERT_EQ(JsonNode(std::string_view("\xC0")).string_value(), "\xEF\xBF\xBD");
  ASSERT_EQ(JsonNode(std::string_view("\xE0\xA0")).string_value(), "\xEF\xBF\xBD");
  ASSERT_EQ(JsonNode(std::string_view("\xF0\x90\x80")).string_value(), "\xEF\xBF\xBD");
  ASSERT_EQ(JsonNode(std::string_view("\xFF")).string_value(), "\xEF\xBF\xBD");
  ASSERT_EQ(JsonNode(std::string_view("\x80")).string_value(), "\xEF\xBF\xBD");

  // Overlong UTF-8
  ASSERT_EQ(JsonNode(std::string_view("\xC0\xAF")).string_value(), "\xEF\xBF\xBD");
  ASSERT_EQ(JsonNode(std::string_view("\xE0\x80\xAF")).string_value(), "\xEF\xBF\xBD");
  ASSERT_EQ(JsonNode(std::string_view("\xF0\x80\x80\xAF")).string_value(), "\xEF\xBF\xBD");

  // UTF-8 encoded surrogates (U+D800 .. U+DFFF)
  ASSERT_EQ(JsonNode(std::string_view("\xED\xA0\x80")).string_value(), "\xEF\xBF\xBD");
  ASSERT_EQ(JsonNode(std::string_view("\xED\xBF\xBF")).string_value(), "\xEF\xBF\xBD");

  // Codepoints > U+10FFFF
  ASSERT_EQ(JsonNode(std::string_view("\xF4\x90\x80\x80")).string_value(), "\xEF\xBF\xBD");
  ASSERT_EQ(JsonNode(std::string_view("\xF5\x80\x80\x80")).string_value(), "\xEF\xBF\xBD");

  // JSON unicode surrogate pairs
  // Valid surrogate pair for musical symbol G clef U+1D11E (\uD834\uDD1E)
  auto res_clef = JsonNode::ParseJson("\"\\uD834\\uDD1E\"");
  ASSERT_TRUE(res_clef.ok());
  ASSERT_EQ(res_clef->string_value(), "\xF0\x9D\x84\x9E");

  // Invalid: High surrogate followed by non-surrogate or EOF
  ASSERT_FALSE(JsonNode::ParseJson("\"\\uD834\"").ok());
  ASSERT_FALSE(JsonNode::ParseJson("\"\\uD834\\u0020\"").ok());
  ASSERT_FALSE(JsonNode::ParseJson("\"\\uD834\\uD834\"").ok());

  // Invalid: Unpaired low surrogate
  ASSERT_FALSE(JsonNode::ParseJson("\"\\uDD1E\"").ok());
}

void TestExtremeNumbersAndSpecialValues() {
  // Very small and very large floating point numbers
  JsonNode small_num(1e-15);
  ASSERT_TRUE(!small_num.ToToon().empty());
  ASSERT_TRUE(!small_num.ToYaml().empty());

  JsonNode large_num(1e25);
  ASSERT_TRUE(!large_num.ToToon().empty());
  ASSERT_TRUE(!large_num.ToYaml().empty());

  JsonNode max_num(std::numeric_limits<double>::max());
  ASSERT_TRUE(!max_num.ToToon().empty());
  ASSERT_TRUE(!max_num.ToYaml().empty());

  JsonNode min_num(std::numeric_limits<double>::lowest());
  ASSERT_TRUE(!min_num.ToToon().empty());
  ASSERT_TRUE(!min_num.ToYaml().empty());

  JsonNode denorm(std::numeric_limits<double>::denorm_min());
  ASSERT_TRUE(!denorm.ToToon().empty());
  ASSERT_TRUE(!denorm.ToYaml().empty());

  // Negative zero
  JsonNode neg_zero(-0.0);
  ASSERT_EQ(neg_zero.ToToon(), "0");
  ASSERT_EQ(neg_zero.ToYaml(), "0");

  // Parsing numbers with exponents
  auto exp1 = JsonNode::ParseJson("1e-5");
  ASSERT_TRUE(exp1.ok());
  ASSERT_EQ(exp1->number_value(), 1e-5);

  auto exp2 = JsonNode::ParseJson("-0.123e+4");
  ASSERT_TRUE(exp2.ok());
  ASSERT_EQ(exp2->number_value(), -1230.0);
}

void TestRobustnessAndEdgeCases() {
  // Tabular with empty sub-objects
  JsonNode tabular_with_empty_sub(std::vector<JsonNode>{
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{
          {"a", JsonNode(std::vector<std::pair<std::string, JsonNode>>{})},
      }),
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{
          {"a", JsonNode(std::vector<std::pair<std::string, JsonNode>>{})},
      }),
  });
  // Empty sub-objects cannot form tabular format; fallback to standard list format
  std::string toon_res = tabular_with_empty_sub.ToToon();
  ASSERT_TRUE(!toon_res.empty());

  // Object with duplicate keys
  JsonNode dup_keys(std::vector<std::pair<std::string, JsonNode>>{
      {"x", JsonNode(1.0)},
      {"x", JsonNode(2.0)},
  });
  ASSERT_TRUE(!dup_keys.ToJson().empty());
  ASSERT_TRUE(!dup_keys.ToToon().empty());
  ASSERT_TRUE(!dup_keys.ToYaml().empty());

  // Stress / Fuzz-like variations of JSON syntax to ensure no crash / UB
  const std::string bad_inputs[] = {
      "",
      " ",
      "   \t\r\n",
      "\\",
      "\"",
      "\x00",
      "\xFF",
      "1.",
      "1.e",
      "1e",
      "1e+",
      "1e-",
      "-",
      "+1",
      "00",
      "01",
      "-01",
      "{\"a\":}",
      "{:1}",
      "[,]",
      "[1,,2]",
      "[1,2,]",
      "\"\\u\"",
      "\"\\u0\"",
      "\"\\u00\"",
      "\"\\u000\"",
      "\"\\u000G\"",
      "\"\\uD800\\u\"",
      "\"\\x00\"",
      "\"\\",
      "\"hello",
      "{\"key\"",
      "{\"key\":",
      "{\"key\": \"val\"",
      "truefalse",
      "null0",
      "[1] 2",
      "{\"a\": 1} 3",
  };

  for (const auto& bad : bad_inputs) {
    auto res = JsonNode::ParseJson(bad);
    // Must be ParseError and must not crash/segfault
    ASSERT_FALSE(res.ok());
  }
}

void TestParseResultApi() {
  // Test value construction and accessors
  ParseResult<int> int_ok(42);
  ASSERT_TRUE(int_ok.ok());
  ASSERT_EQ(*int_ok, 42);

  // Test error construction and accessors
  ParseResult<int> int_err(ParseError{"test error"});
  ASSERT_FALSE(int_err.ok());
  ASSERT_EQ(int_err.error().message, "test error");

  // Test member access operator->()
  struct Data {
    std::string name;
    int count = 0;
  };
  ParseResult<Data> data_ok(Data{"test_name", 7});
  ASSERT_TRUE(data_ok.ok());
  ASSERT_EQ(data_ok->name, "test_name");
  ASSERT_EQ(data_ok->count, 7);
  data_ok->count = 10;
  ASSERT_EQ(data_ok->count, 10);
  const auto& const_data = data_ok;
  ASSERT_EQ(const_data->name, "test_name");
  ASSERT_EQ(const_data->count, 10);

  // Test copy construction and copy assignment
  ParseResult<std::string> str_ok(std::string("hello world"));
  ParseResult<std::string> str_copied(str_ok);
  ASSERT_TRUE(str_copied.ok());
  ASSERT_EQ(*str_copied, "hello world");
  ParseResult<std::string> str_assigned(std::string("initial"));
  str_assigned = str_ok;
  ASSERT_TRUE(str_assigned.ok());
  ASSERT_EQ(*str_assigned, "hello world");

  // Test move construction and move assignment
  ParseResult<std::string> to_move(std::string("moving"));
  ParseResult<std::string> moved(std::move(to_move));
  ASSERT_TRUE(moved.ok());
  ASSERT_EQ(*moved, "moving");
  ParseResult<std::string> moved_target(std::string("target"));
  moved_target = std::move(moved);
  ASSERT_TRUE(moved_target.ok());
  ASSERT_EQ(*moved_target, "moving");

  // Test rvalue extraction with std::move
  std::string extracted = *std::move(moved_target);
  ASSERT_EQ(extracted, "moving");

  ParseResult<std::string> err_to_move(ParseError{"moved err"});
  ParseResult<std::string> err_moved(std::move(err_to_move));
  ASSERT_FALSE(err_moved.ok());
  ParseError extracted_err = std::move(err_moved).error();
  ASSERT_EQ(extracted_err.message, "moved err");

  // Test kOkStatus
  static_assert(typeprompt::kOkStatus.ok());
  ASSERT_TRUE(typeprompt::kOkStatus.ok());
}

}  // namespace

namespace test_custom_adl {
struct Point {
  double x = 0.0;
  double y = 0.0;
};

inline typeprompt::JsonNode ToJsonNode(const Point& p) {
  return typeprompt::JsonNode(std::vector<std::pair<std::string, typeprompt::JsonNode>>{
      {"x", typeprompt::ToJsonNode(p.x)},
      {"y", typeprompt::ToJsonNode(p.y)},
  });
}

inline typeprompt::ParseStatus ParseJsonNode(const typeprompt::JsonNode& node, Point& p) {
  if (node.type() != typeprompt::JsonNode::Type::kObject) {
    return typeprompt::ParseError{"Expected object for Point"};
  }
  for (const auto& [k, v] : node.object_value()) {
    if (k == "x") {
      if (auto status = typeprompt::ParseJsonNode(v, p.x); !status.ok()) return status;
    } else if (k == "y") {
      if (auto status = typeprompt::ParseJsonNode(v, p.y); !status.ok()) return status;
    }
  }
  return typeprompt::kOkStatus;
}
}  // namespace test_custom_adl

namespace {

void TestToJsonNodeOverloads() {
  using typeprompt::ToJsonNode;

  // 1. JsonNode overload
  JsonNode raw_node(42.0);
  JsonNode from_node = ToJsonNode(raw_node);
  ASSERT_EQ(from_node.type(), JsonNode::Type::kNumber);
  ASSERT_EQ(from_node.number_value(), 42.0);

  // 2. bool overload
  JsonNode b_true = ToJsonNode(true);
  ASSERT_EQ(b_true.type(), JsonNode::Type::kBool);
  ASSERT_EQ(b_true.bool_value(), true);

  JsonNode b_false = ToJsonNode(false);
  ASSERT_EQ(b_false.type(), JsonNode::Type::kBool);
  ASSERT_EQ(b_false.bool_value(), false);

  // 3. double and int overloads
  JsonNode num_double = ToJsonNode(3.14159);
  ASSERT_EQ(num_double.type(), JsonNode::Type::kNumber);
  ASSERT_EQ(num_double.number_value(), 3.14159);

  JsonNode num_double2 = ToJsonNode(100.0);
  ASSERT_EQ(num_double2.type(), JsonNode::Type::kNumber);
  ASSERT_EQ(num_double2.number_value(), 100.0);

  JsonNode num_int = ToJsonNode(100);
  ASSERT_EQ(num_int.type(), JsonNode::Type::kNumber);
  ASSERT_EQ(num_int.number_value(), 100.0);

  // 4. std::string_view overload
  std::string_view sv = "sv_hello";
  JsonNode sv_res = ToJsonNode(sv);
  ASSERT_EQ(sv_res.type(), JsonNode::Type::kString);
  ASSERT_EQ(sv_res.string_value(), "sv_hello");

  std::string s = "std_string_val";
  JsonNode str_res = ToJsonNode(s);
  ASSERT_EQ(str_res.type(), JsonNode::Type::kString);
  ASSERT_EQ(str_res.string_value(), "std_string_val");

  JsonNode lit_res = ToJsonNode(std::string_view("string_literal"));
  ASSERT_EQ(lit_res.type(), JsonNode::Type::kString);
  ASSERT_EQ(lit_res.string_value(), "string_literal");

  // 5. std::optional<T> overload
  std::optional<double> opt_val = 55.0;
  JsonNode opt_res = ToJsonNode(opt_val);
  ASSERT_EQ(opt_res.type(), JsonNode::Type::kNumber);
  ASSERT_EQ(opt_res.number_value(), 55.0);

  std::optional<int> opt_int = 42;
  JsonNode opt_int_res = ToJsonNode(opt_int);
  ASSERT_EQ(opt_int_res.type(), JsonNode::Type::kNumber);
  ASSERT_EQ(opt_int_res.number_value(), 42.0);

  std::optional<std::string> opt_str = "opt_text";
  JsonNode opt_str_res = ToJsonNode(opt_str);
  ASSERT_EQ(opt_str_res.type(), JsonNode::Type::kString);
  ASSERT_EQ(opt_str_res.string_value(), "opt_text");

  std::optional<double> opt_empty = std::nullopt;
  JsonNode opt_empty_res = ToJsonNode(opt_empty);
  ASSERT_EQ(opt_empty_res.type(), JsonNode::Type::kNull);

  std::optional<JsonNode> opt_node = JsonNode("node_inside_opt");
  JsonNode opt_node_res = ToJsonNode(opt_node);
  ASSERT_EQ(opt_node_res.type(), JsonNode::Type::kString);
  ASSERT_EQ(opt_node_res.string_value(), "node_inside_opt");

  std::optional<JsonNode> opt_node_empty = std::nullopt;
  JsonNode opt_node_empty_res = ToJsonNode(opt_node_empty);
  ASSERT_EQ(opt_node_empty_res.type(), JsonNode::Type::kNull);

  // 6. std::vector<T> overload
  std::vector<double> vec_nums = {1.0, 2.0, 3.0};
  JsonNode vec_nums_res = ToJsonNode(vec_nums);
  ASSERT_EQ(vec_nums_res.type(), JsonNode::Type::kArray);
  ASSERT_EQ(vec_nums_res.array_value().size(), 3);
  ASSERT_EQ(vec_nums_res.array_value()[0].number_value(), 1.0);
  ASSERT_EQ(vec_nums_res.array_value()[1].number_value(), 2.0);
  ASSERT_EQ(vec_nums_res.array_value()[2].number_value(), 3.0);

  std::vector<int> vec_ints = {10, 20, 30};
  JsonNode vec_ints_res = ToJsonNode(vec_ints);
  ASSERT_EQ(vec_ints_res.type(), JsonNode::Type::kArray);
  ASSERT_EQ(vec_ints_res.array_value().size(), 3);
  ASSERT_EQ(vec_ints_res.array_value()[0].number_value(), 10.0);
  ASSERT_EQ(vec_ints_res.array_value()[1].number_value(), 20.0);
  ASSERT_EQ(vec_ints_res.array_value()[2].number_value(), 30.0);

  std::vector<std::string> vec_strs = {"alpha", "beta"};
  JsonNode vec_strs_res = ToJsonNode(vec_strs);
  ASSERT_EQ(vec_strs_res.type(), JsonNode::Type::kArray);
  ASSERT_EQ(vec_strs_res.array_value().size(), 2);
  ASSERT_EQ(vec_strs_res.array_value()[0].string_value(), "alpha");
  ASSERT_EQ(vec_strs_res.array_value()[1].string_value(), "beta");

  std::vector<std::optional<double>> vec_opts = {1.5, std::nullopt, 2.5};
  JsonNode vec_opts_res = ToJsonNode(vec_opts);
  ASSERT_EQ(vec_opts_res.type(), JsonNode::Type::kArray);
  ASSERT_EQ(vec_opts_res.array_value().size(), 3);
  ASSERT_EQ(vec_opts_res.array_value()[0].number_value(), 1.5);
  ASSERT_EQ(vec_opts_res.array_value()[1].type(), JsonNode::Type::kNull);
  ASSERT_EQ(vec_opts_res.array_value()[2].number_value(), 2.5);

  // 7. ADL with custom type
  test_custom_adl::Point pt{10.0, 20.0};
  JsonNode pt_res = ToJsonNode(pt);
  ASSERT_EQ(pt_res.type(), JsonNode::Type::kObject);
  ASSERT_EQ(pt_res.object_value().size(), 2);
  ASSERT_EQ(pt_res.object_value()[0].first, "x");
  ASSERT_EQ(pt_res.object_value()[0].second.number_value(), 10.0);
  ASSERT_EQ(pt_res.object_value()[1].first, "y");
  ASSERT_EQ(pt_res.object_value()[1].second.number_value(), 20.0);

  std::vector<test_custom_adl::Point> pts = {test_custom_adl::Point{1.0, 2.0},
                                             test_custom_adl::Point{3.0, 4.0}};
  JsonNode pts_res = ToJsonNode(pts);
  ASSERT_EQ(pts_res.type(), JsonNode::Type::kArray);
  ASSERT_EQ(pts_res.array_value().size(), 2);
  ASSERT_EQ(pts_res.array_value()[0].type(), JsonNode::Type::kObject);
  ASSERT_EQ(pts_res.array_value()[1].type(), JsonNode::Type::kObject);

  std::optional<test_custom_adl::Point> opt_pt = test_custom_adl::Point{5.0, 6.0};
  JsonNode opt_pt_res = ToJsonNode(opt_pt);
  ASSERT_EQ(opt_pt_res.type(), JsonNode::Type::kObject);
  ASSERT_EQ(opt_pt_res.object_value()[0].second.number_value(), 5.0);

  std::optional<test_custom_adl::Point> opt_pt_null = std::nullopt;
  JsonNode opt_pt_null_res = ToJsonNode(opt_pt_null);
  ASSERT_EQ(opt_pt_null_res.type(), JsonNode::Type::kNull);

  // 8. std::unordered_map<std::string, T> overload
  std::unordered_map<std::string, int> map_ints = {{"a", 1}, {"b", 2}};
  JsonNode map_ints_res = ToJsonNode(map_ints);
  ASSERT_EQ(map_ints_res.type(), JsonNode::Type::kObject);
  ASSERT_EQ(map_ints_res.object_value().size(), 2);

  // 9. std::variant<Ts...> overload
  std::variant<int, std::string, test_custom_adl::Point> var_int = 42;
  JsonNode var_int_res = ToJsonNode(var_int);
  ASSERT_EQ(var_int_res.type(), JsonNode::Type::kNumber);
  ASSERT_EQ(var_int_res.number_value(), 42.0);

  std::variant<int, std::string, test_custom_adl::Point> var_str = std::string("hello variant");
  JsonNode var_str_res = ToJsonNode(var_str);
  ASSERT_EQ(var_str_res.type(), JsonNode::Type::kString);
  ASSERT_EQ(var_str_res.string_value(), "hello variant");

  std::variant<int, std::string, test_custom_adl::Point> var_pt = test_custom_adl::Point{7.0, 8.0};
  JsonNode var_pt_res = ToJsonNode(var_pt);
  ASSERT_EQ(var_pt_res.type(), JsonNode::Type::kObject);
  ASSERT_EQ(var_pt_res.object_value()[0].second.number_value(), 7.0);
  ASSERT_EQ(var_pt_res.object_value()[1].second.number_value(), 8.0);
}

void TestParseJsonNodeOverloads() {
  using typeprompt::ParseJsonNode;

  // 1. JsonNode
  JsonNode in_node(42.0);
  JsonNode out_node;
  auto status_node = ParseJsonNode(in_node, out_node);
  ASSERT_TRUE(status_node.ok());
  ASSERT_EQ(out_node.number_value(), 42.0);

  // 2. bool
  bool out_b = false;
  ASSERT_TRUE(ParseJsonNode(JsonNode(true), out_b).ok());
  ASSERT_EQ(out_b, true);
  ASSERT_TRUE(ParseJsonNode(JsonNode(false), out_b).ok());
  ASSERT_EQ(out_b, false);
  ASSERT_FALSE(ParseJsonNode(JsonNode(123.0), out_b).ok());

  // 3. int
  int out_int = 0;
  ASSERT_TRUE(ParseJsonNode(JsonNode(42.0), out_int).ok());
  ASSERT_EQ(out_int, 42);
  ASSERT_FALSE(ParseJsonNode(JsonNode("not a number"), out_int).ok());

  // 4. double
  double out_d = 0.0;
  ASSERT_TRUE(ParseJsonNode(JsonNode(3.14159), out_d).ok());
  ASSERT_EQ(out_d, 3.14159);
  ASSERT_FALSE(ParseJsonNode(JsonNode(true), out_d).ok());

  // 5. std::string
  std::string out_str;
  ASSERT_TRUE(ParseJsonNode(JsonNode("hello"), out_str).ok());
  ASSERT_EQ(out_str, "hello");
  ASSERT_FALSE(ParseJsonNode(JsonNode(123.0), out_str).ok());

  // 6. std::optional<T>
  std::optional<int> out_opt_int;
  ASSERT_TRUE(ParseJsonNode(JsonNode(100.0), out_opt_int).ok());
  ASSERT_TRUE(out_opt_int.has_value());
  ASSERT_EQ(*out_opt_int, 100);

  ASSERT_TRUE(ParseJsonNode(JsonNode(std::nullopt), out_opt_int).ok());
  ASSERT_FALSE(out_opt_int.has_value());

  std::optional<std::string> out_opt_str;
  ASSERT_TRUE(ParseJsonNode(JsonNode("optional text"), out_opt_str).ok());
  ASSERT_TRUE(out_opt_str.has_value());
  ASSERT_EQ(*out_opt_str, "optional text");

  ASSERT_FALSE(ParseJsonNode(JsonNode(42.0), out_opt_str).ok());

  // 7. std::vector<T>
  std::vector<int> out_vec_int;
  JsonNode arr_int(std::vector<JsonNode>{JsonNode(1.0), JsonNode(2.0), JsonNode(3.0)});
  ASSERT_TRUE(ParseJsonNode(arr_int, out_vec_int).ok());
  ASSERT_EQ(out_vec_int.size(), 3);
  ASSERT_EQ(out_vec_int[0], 1);
  ASSERT_EQ(out_vec_int[1], 2);
  ASSERT_EQ(out_vec_int[2], 3);

  std::vector<std::string> out_vec_str;
  JsonNode arr_str(std::vector<JsonNode>{JsonNode("a"), JsonNode("b")});
  ASSERT_TRUE(ParseJsonNode(arr_str, out_vec_str).ok());
  ASSERT_EQ(out_vec_str.size(), 2);
  ASSERT_EQ(out_vec_str[0], "a");
  ASSERT_EQ(out_vec_str[1], "b");

  ASSERT_FALSE(ParseJsonNode(JsonNode("not an array"), out_vec_str).ok());

  JsonNode arr_bad(std::vector<JsonNode>{JsonNode("a"), JsonNode(123.0)});
  ASSERT_FALSE(ParseJsonNode(arr_bad, out_vec_str).ok());

  // 8. ADL custom type
  test_custom_adl::Point pt;
  JsonNode pt_node(
      std::vector<std::pair<std::string, JsonNode>>{{"x", JsonNode(5.0)}, {"y", JsonNode(6.0)}});
  ASSERT_TRUE(ParseJsonNode(pt_node, pt).ok());
  ASSERT_EQ(pt.x, 5.0);
  ASSERT_EQ(pt.y, 6.0);

  std::vector<test_custom_adl::Point> pts;
  JsonNode pts_node(std::vector<JsonNode>{
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{{"x", JsonNode(1.0)},
                                                             {"y", JsonNode(2.0)}}),
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{{"x", JsonNode(3.0)},
                                                             {"y", JsonNode(4.0)}}),
  });
  ASSERT_TRUE(ParseJsonNode(pts_node, pts).ok());
  ASSERT_EQ(pts.size(), 2);
  ASSERT_EQ(pts[0].x, 1.0);
  ASSERT_EQ(pts[1].y, 4.0);

  std::optional<test_custom_adl::Point> opt_pt;
  ASSERT_TRUE(ParseJsonNode(pt_node, opt_pt).ok());
  ASSERT_TRUE(opt_pt.has_value());
  ASSERT_EQ(opt_pt->x, 5.0);

  ASSERT_TRUE(ParseJsonNode(JsonNode(std::nullopt), opt_pt).ok());
  ASSERT_FALSE(opt_pt.has_value());

  // 9. std::unordered_map<std::string, T>
  std::unordered_map<std::string, int> out_map_int;
  JsonNode map_node(JsonNode::Object{{"x", JsonNode(10.0)}, {"y", JsonNode(20.0)}});
  ASSERT_TRUE(ParseJsonNode(map_node, out_map_int).ok());
  ASSERT_EQ(out_map_int.size(), 2);
  ASSERT_EQ(out_map_int["x"], 10);
  ASSERT_EQ(out_map_int["y"], 20);

  ASSERT_FALSE(ParseJsonNode(JsonNode(123.0), out_map_int).ok());
  JsonNode map_node_bad(JsonNode::Object{{"x", JsonNode("not an int")}});
  ASSERT_FALSE(ParseJsonNode(map_node_bad, out_map_int).ok());
}

void TestParseJsonNodeSingleArgOverloads() {
  using typeprompt::ParseJsonNode;

  // --- 1. ParseJsonNode<T>(const JsonNode&) ---
  auto res_int = ParseJsonNode<int>(JsonNode(42.0));
  ASSERT_TRUE(res_int.ok());
  ASSERT_EQ(*res_int, 42);

  auto res_int_err = ParseJsonNode<int>(JsonNode("not an int"));
  ASSERT_FALSE(res_int_err.ok());

  auto res_bool = ParseJsonNode<bool>(JsonNode(true));
  ASSERT_TRUE(res_bool.ok());
  ASSERT_EQ(*res_bool, true);

  auto res_double = ParseJsonNode<double>(JsonNode(2.718));
  ASSERT_TRUE(res_double.ok());
  ASSERT_EQ(*res_double, 2.718);

  auto res_str = ParseJsonNode<std::string>(JsonNode("hello world"));
  ASSERT_TRUE(res_str.ok());
  ASSERT_EQ(*res_str, "hello world");

  // Optional
  auto res_opt_val = ParseJsonNode<std::optional<int>>(JsonNode(123.0));
  ASSERT_TRUE(res_opt_val.ok());
  ASSERT_TRUE(res_opt_val->has_value());
  ASSERT_EQ(**res_opt_val, 123);

  auto res_opt_null = ParseJsonNode<std::optional<int>>(JsonNode(std::nullopt));
  ASSERT_TRUE(res_opt_null.ok());
  ASSERT_FALSE(res_opt_null->has_value());

  // Vector
  JsonNode arr_node(std::vector<JsonNode>{JsonNode(10.0), JsonNode(20.0)});
  auto res_vec = ParseJsonNode<std::vector<int>>(arr_node);
  ASSERT_TRUE(res_vec.ok());
  ASSERT_EQ(res_vec->size(), 2);
  ASSERT_EQ((*res_vec)[0], 10);
  ASSERT_EQ((*res_vec)[1], 20);

  // Custom ADL type
  JsonNode pt_node(
      std::vector<std::pair<std::string, JsonNode>>{{"x", JsonNode(3.0)}, {"y", JsonNode(4.0)}});
  auto res_pt = ParseJsonNode<test_custom_adl::Point>(pt_node);
  ASSERT_TRUE(res_pt.ok());
  ASSERT_EQ(res_pt->x, 3.0);
  ASSERT_EQ(res_pt->y, 4.0);

  // --- 2. ParseJsonNode<T>(std::string_view) ---
  auto res_json_int = ParseJsonNode<int>("42");
  ASSERT_TRUE(res_json_int.ok());
  ASSERT_EQ(*res_json_int, 42);

  auto res_json_double = ParseJsonNode<double>("3.14159");
  ASSERT_TRUE(res_json_double.ok());
  ASSERT_EQ(*res_json_double, 3.14159);

  auto res_json_bool = ParseJsonNode<bool>("true");
  ASSERT_TRUE(res_json_bool.ok());
  ASSERT_EQ(*res_json_bool, true);

  auto res_json_str = ParseJsonNode<std::string>("\"hello from json\"");
  ASSERT_TRUE(res_json_str.ok());
  ASSERT_EQ(*res_json_str, "hello from json");

  auto res_json_vec = ParseJsonNode<std::vector<std::string>>("[\"abc\", \"def\"]");
  ASSERT_TRUE(res_json_vec.ok());
  ASSERT_EQ(res_json_vec->size(), 2);
  ASSERT_EQ((*res_json_vec)[0], "abc");
  ASSERT_EQ((*res_json_vec)[1], "def");

  auto res_json_pt = ParseJsonNode<test_custom_adl::Point>("{\"x\": 7.5, \"y\": 8.5}");
  ASSERT_TRUE(res_json_pt.ok());
  ASSERT_EQ(res_json_pt->x, 7.5);
  ASSERT_EQ(res_json_pt->y, 8.5);

  // Error cases for JSON string parsing
  auto res_json_malformed = ParseJsonNode<int>("{not valid json");
  ASSERT_FALSE(res_json_malformed.ok());

  auto res_json_type_mismatch = ParseJsonNode<int>("\"not a number\"");
  ASSERT_FALSE(res_json_type_mismatch.ok());

  auto res_json_pt_mismatch = ParseJsonNode<test_custom_adl::Point>("[1, 2, 3]");
  ASSERT_FALSE(res_json_pt_mismatch.ok());
}

void TestStructParser() {
  using typeprompt::internal::StructParser;

  // 1. Successful parse of required and optional fields (in alphabetical order)
  JsonNode::Object obj1 = {
      {"name", JsonNode("Alice")},
      {"age", JsonNode(30.0)},
      {"email", JsonNode("alice@example.com")},
  };
  StructParser parser1(&obj1);
  int age = 0;
  std::optional<std::string> email;
  std::string name;
  parser1.Parse("age", age);
  parser1.ParseOptional("email", email);
  parser1.Parse("name", name);

  auto status1 = std::move(parser1).status();
  ASSERT_TRUE(status1.ok());
  ASSERT_EQ(age, 30);
  ASSERT_TRUE(email.has_value());
  ASSERT_EQ(*email, "alice@example.com");
  ASSERT_EQ(name, "Alice");

  // 2. Omitted optional fields
  JsonNode::Object obj2 = {
      {"name", JsonNode("Bob")},
  };
  StructParser parser2(&obj2);
  std::optional<int> opt_age;
  std::optional<std::string> opt_email;
  std::string name2;
  parser2.ParseOptional("age", opt_age);
  parser2.ParseOptional("email", opt_email);
  parser2.Parse("name", name2);

  auto status2 = std::move(parser2).status();
  ASSERT_TRUE(status2.ok());
  ASSERT_FALSE(opt_age.has_value());
  ASSERT_FALSE(opt_email.has_value());
  ASSERT_EQ(name2, "Bob");

  // 3. Extra unrequested fields in object are ignored
  JsonNode::Object obj3 = {
      {"extra1", JsonNode(true)},
      {"name", JsonNode("Charlie")},
      {"extra2", JsonNode(99.0)},
  };
  StructParser parser3(&obj3);
  std::string name3;
  parser3.Parse("name", name3);

  auto status3 = std::move(parser3).status();
  ASSERT_TRUE(status3.ok());
  ASSERT_EQ(name3, "Charlie");

  // 4. Missing required field
  JsonNode::Object obj4 = {
      {"email", JsonNode("dave@example.com")},
  };
  StructParser parser4(&obj4);
  std::optional<std::string> email4;
  std::string name4;
  parser4.ParseOptional("email", email4);
  parser4.Parse("name", name4);

  auto status4 = std::move(parser4).status();
  ASSERT_FALSE(status4.ok());
  ASSERT_EQ(status4.error().message, "Missing key: name");

  // 5. Type mismatch error on field
  JsonNode::Object obj5 = {
      {"age", JsonNode("not_a_number")},
      {"name", JsonNode("Eve")},
  };
  StructParser parser5(&obj5);
  int age5 = 0;
  std::string name5;
  parser5.Parse("age", age5);
  parser5.Parse("name", name5);

  auto status5 = std::move(parser5).status();
  ASSERT_FALSE(status5.ok());
  ASSERT_EQ(status5.error().message, "Expected number");

  // 6. Empty object
  JsonNode::Object empty_obj;
  StructParser parser6(&empty_obj);
  std::optional<int> empty_opt;
  std::string req_str;
  parser6.ParseOptional("a", empty_opt);
  parser6.Parse("b", req_str);

  auto status6 = std::move(parser6).status();
  ASSERT_FALSE(status6.ok());
  ASSERT_EQ(status6.error().message, "Missing key: b");
}

}  // namespace

void TestRuntimeLogic() {
  TestToJsonNull();
  TestToJsonBool();
  TestToJsonNumber();
  TestToJsonString();
  TestToJsonArray();
  TestToJsonObject();
  TestToJsonNestedComplex();

  TestToJsonWithIndentNull();
  TestToJsonWithIndentBool();
  TestToJsonWithIndentNumber();
  TestToJsonWithIndentString();
  TestToJsonWithIndentArray();
  TestToJsonWithIndentObject();
  TestToJsonWithIndentNestedComplex();

  TestToToonPrimitives();
  TestToToonNumbers();
  TestToToonStringsAndEscapes();
  TestToToonKeys();
  TestToToonEmptyStructures();
  TestToToonPrimitiveArrays();
  TestToToonArraysOfArrays();
  TestToToonTabularArrays();
  TestToToonTabularNestedFieldGroups();
  TestToToonKeyedTabular();
  TestToToonListForm();
  TestToToonObjectsAsListItems();
  TestToToonObjectsAsListItemsWithTabular();
  TestToToonGeneralObjects();

  TestToYamlPrimitives();
  TestToYamlNumbers();
  TestToYamlStringsAndEscapes();
  TestToYamlKeys();
  TestToYamlEmptyStructures();
  TestToYamlArrays();
  TestToYamlObjects();
  TestToYamlObjectsAsListItems();
  TestToYamlComplexNested();

  TestParseJsonPrimitives();
  TestParseJsonNumbers();
  TestParseJsonStrings();
  TestParseJsonArrays();
  TestParseJsonObjects();
  TestParseJsonErrors();
  TestParseJsonRoundtrip();

  TestNonZeroTerminatedStringViews();
  TestDeepNestingProtection();
  TestMalformedUtf8AndUnicodeSurrogates();
  TestExtremeNumbersAndSpecialValues();
  TestRobustnessAndEdgeCases();
  TestParseResultApi();
  TestToJsonNodeOverloads();
  TestParseJsonNodeOverloads();
  TestParseJsonNodeSingleArgOverloads();
  TestStructParser();
}

int main() {
  std::cout << "Running C++ runtime logic tests...\n";
  TestRuntimeLogic();
  std::cout << "All C++ tests passed.\n";
  return 0;
}
