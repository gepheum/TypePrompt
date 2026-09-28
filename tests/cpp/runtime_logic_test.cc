#include "runtime_logic.h"

#include <cstdlib>
#include <iostream>
#include <limits>
#include <map>
#include <string>
#include <utility>
#include <vector>

#include "gen/prompts_01.gen.h"
#include "gen/prompts_02.gen.h"
#include "gen/prompts_03.gen.h"
#include "gen/prompts_04.gen.h"
#include "gen/prompts_05.gen.h"
#include "gen/prompts_06.gen.h"
#include "gen/prompts_07.gen.h"
#include "gen/prompts_e01.gen.h"

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
  ASSERT_EQ(num_zero.ToJson(), "0");

  JsonNode num_pos(42.5);
  ASSERT_EQ(num_pos.ToJson(), "42.5");

  JsonNode num_neg(-17.25);
  ASSERT_EQ(num_neg.ToJson(), "-17.25");

  JsonNode num_nan(std::numeric_limits<double>::quiet_NaN());
  ASSERT_EQ(num_nan.ToJson(), "null");

  JsonNode num_pos_inf(std::numeric_limits<double>::infinity());
  ASSERT_EQ(num_pos_inf.ToJson(), "null");

  JsonNode num_neg_inf(-std::numeric_limits<double>::infinity());
  ASSERT_EQ(num_neg_inf.ToJson(), "null");
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
  ASSERT_EQ(sv_node.as_string(), "sv_test");

  std::string full = "prefix_target_suffix";
  std::string_view sub(full.data() + 7, 6);
  JsonNode sub_node(sub);
  ASSERT_EQ(sub_node.as_string(), "target");

  // Non-null-terminated string_view with incomplete multi-byte at boundary
  char raw_bytes[] = {'h', 'e', 'l', 'l', 'o', static_cast<char>(0xC0), 'x'};
  std::string_view partial_sv(raw_bytes, 6);
  JsonNode partial_node(partial_sv);
  ASSERT_EQ(partial_node.as_string(), "hello\xEF\xBF\xBD");
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
  ASSERT_EQ(multi_arr.ToJson(), "[null,true,12,\"text\"]");

  JsonNode nested_arr(std::vector<JsonNode>{
      JsonNode(std::vector<JsonNode>{JsonNode(1.0), JsonNode(2.0)}),
      JsonNode(std::vector<JsonNode>{}),
      JsonNode(std::vector<JsonNode>{JsonNode(std::vector<JsonNode>{JsonNode(3.0)})}),
  });
  ASSERT_EQ(nested_arr.ToJson(), "[[1,2],[],[[3]]]");
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
  ASSERT_EQ(multi_obj.ToJson(),
            "{\"name\": \"Alice\",\"age\": 30,\"active\": true,\"extra\": null}");

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
      "{\"id\": 1,\"tags\": [\"c++\",\"json\",\"json\"]},"
      "{\"id\": 2,\"tags\": []}"
      "],"
      "\"completed\": false}";
  ASSERT_EQ(complex_node.ToJson(), expected);
}

void TestToPrettyJsonNull() {
  JsonNode default_null;
  ASSERT_EQ(default_null.ToPrettyJson(), "null");

  JsonNode explicit_null(std::nullopt);
  ASSERT_EQ(explicit_null.ToPrettyJson(), "null");
}

void TestToPrettyJsonBool() {
  JsonNode bool_true(true);
  ASSERT_EQ(bool_true.ToPrettyJson(), "true");

  JsonNode bool_false(false);
  ASSERT_EQ(bool_false.ToPrettyJson(), "false");
}

void TestToPrettyJsonNumber() {
  JsonNode num(42.0);
  ASSERT_EQ(num.ToPrettyJson(), "42");

  JsonNode num_nan(std::numeric_limits<double>::quiet_NaN());
  ASSERT_EQ(num_nan.ToPrettyJson(), "null");
}

void TestToPrettyJsonString() {
  JsonNode str(std::string("hello\nworld"));
  ASSERT_EQ(str.ToPrettyJson(), "\"hello\\nworld\"");
}

void TestToPrettyJsonArray() {
  JsonNode empty_arr(std::vector<JsonNode>{});
  ASSERT_EQ(empty_arr.ToPrettyJson(), "[]");

  JsonNode single_arr(std::vector<JsonNode>{JsonNode(std::string("first"))});
  ASSERT_EQ(single_arr.ToPrettyJson(),
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
      "  1,\n"
      "  \"two\",\n"
      "  true\n"
      "]";
  ASSERT_EQ(multi_arr.ToPrettyJson(), expected_multi);

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
      "    1,\n"
      "    2\n"
      "  ],\n"
      "  [],\n"
      "  [\n"
      "    [\n"
      "      3\n"
      "    ]\n"
      "  ]\n"
      "]";
  ASSERT_EQ(nested_arr.ToPrettyJson(), expected_nested);
}

void TestToPrettyJsonObject() {
  JsonNode empty_obj(std::vector<std::pair<std::string, JsonNode>>{});
  ASSERT_EQ(empty_obj.ToPrettyJson(), "{}");

  JsonNode single_obj(
      std::vector<std::pair<std::string, JsonNode>>{{"key", JsonNode(std::string("value"))}});
  ASSERT_EQ(single_obj.ToPrettyJson(),
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
      "  \"age\": 30,\n"
      "  \"active\": true\n"
      "}";
  ASSERT_EQ(multi_obj.ToPrettyJson(), expected_multi);

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
  ASSERT_EQ(nested_obj.ToPrettyJson(), expected_nested);
}

void TestToPrettyJsonNestedComplex() {
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
      "      \"id\": 1,\n"
      "      \"tags\": [\n"
      "        \"c++\",\n"
      "        \"json\"\n"
      "      ]\n"
      "    },\n"
      "    {\n"
      "      \"id\": 2,\n"
      "      \"tags\": []\n"
      "    }\n"
      "  ],\n"
      "  \"completed\": false\n"
      "}";
  ASSERT_EQ(complex_node.ToPrettyJson(), expected);
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
  ASSERT_EQ(r_true->as_bool(), true);
  ASSERT_EQ(r_true->ToJson(), "true");

  auto r_false = JsonNode::ParseJson(" \nfalse\t ");
  ASSERT_TRUE(r_false.ok());
  ASSERT_EQ(r_false->type(), JsonNode::Type::kBool);
  ASSERT_EQ(r_false->as_bool(), false);
  ASSERT_EQ(r_false->ToJson(), "false");
}

void TestParseJsonNumbers() {
  auto parse_num = [](std::string_view s) -> double {
    auto r = JsonNode::ParseJson(s);
    ASSERT_TRUE(r.ok());
    ASSERT_EQ(r->type(), JsonNode::Type::kNumber);
    return r->as_number();
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
    return r->as_string();
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
  ASSERT_EQ(r_empty->as_array().size(), 0);

  auto r_empty_ws = JsonNode::ParseJson(" [ \n\t\r ] ");
  ASSERT_TRUE(r_empty_ws.ok());
  ASSERT_EQ(r_empty_ws->as_array().size(), 0);

  auto r_nums = JsonNode::ParseJson("[1, 2, 3]");
  ASSERT_TRUE(r_nums.ok());
  const auto& arr_nums = r_nums->as_array();
  ASSERT_EQ(arr_nums.size(), 3);
  ASSERT_EQ(arr_nums[0].as_number(), 1.0);
  ASSERT_EQ(arr_nums[1].as_number(), 2.0);
  ASSERT_EQ(arr_nums[2].as_number(), 3.0);

  auto r_mixed = JsonNode::ParseJson("[null, true, false, \"text\", 42.5]");
  ASSERT_TRUE(r_mixed.ok());
  const auto& arr_mixed = r_mixed->as_array();
  ASSERT_EQ(arr_mixed.size(), 5);
  ASSERT_EQ(arr_mixed[0].type(), JsonNode::Type::kNull);
  ASSERT_EQ(arr_mixed[1].as_bool(), true);
  ASSERT_EQ(arr_mixed[2].as_bool(), false);
  ASSERT_EQ(arr_mixed[3].as_string(), "text");
  ASSERT_EQ(arr_mixed[4].as_number(), 42.5);

  auto r_nested = JsonNode::ParseJson("[[], [1, [2, [3]]]]");
  ASSERT_TRUE(r_nested.ok());
  const auto& arr_nested = r_nested->as_array();
  ASSERT_EQ(arr_nested.size(), 2);
  ASSERT_EQ(arr_nested[0].as_array().size(), 0);
  ASSERT_EQ(arr_nested[1].as_array()[1].as_array()[1].as_array()[0].as_number(), 3.0);
}

void TestParseJsonObjects() {
  auto r_empty = JsonNode::ParseJson("{}");
  ASSERT_TRUE(r_empty.ok());
  ASSERT_EQ(r_empty->type(), JsonNode::Type::kObject);
  ASSERT_EQ(r_empty->as_object().size(), 0);

  auto r_empty_ws = JsonNode::ParseJson(" { \n\t\r } ");
  ASSERT_TRUE(r_empty_ws.ok());
  ASSERT_EQ(r_empty_ws->as_object().size(), 0);

  auto r_single = JsonNode::ParseJson("{\"key\": \"value\"}");
  ASSERT_TRUE(r_single.ok());
  const auto& obj_single = r_single->as_object();
  ASSERT_EQ(obj_single.size(), 1);
  ASSERT_EQ(obj_single[0].first, "key");
  ASSERT_EQ(obj_single[0].second.as_string(), "value");

  auto r_escaped_keys =
      JsonNode::ParseJson("{\"a/b\": 1, \"c\\\\d\": 2, \"e\\\"f\": 3, \"\\u006b\": 4}");
  ASSERT_TRUE(r_escaped_keys.ok());
  const auto& obj_esc = r_escaped_keys->as_object();
  ASSERT_EQ(obj_esc.size(), 4);
  ASSERT_EQ(obj_esc[0].first, "a/b");
  ASSERT_EQ(obj_esc[1].first, "c\\d");
  ASSERT_EQ(obj_esc[2].first, "e\"f");
  ASSERT_EQ(obj_esc[3].first, "k");

  auto r_multi =
      JsonNode::ParseJson("{\"name\": \"Alice\", \"age\": 30, \"active\": true, \"extra\": null}");
  ASSERT_TRUE(r_multi.ok());
  const auto& obj_multi = r_multi->as_object();
  ASSERT_EQ(obj_multi.size(), 4);
  ASSERT_EQ(obj_multi[0].first, "name");
  ASSERT_EQ(obj_multi[0].second.as_string(), "Alice");
  ASSERT_EQ(obj_multi[1].first, "age");
  ASSERT_EQ(obj_multi[1].second.as_number(), 30.0);
  ASSERT_EQ(obj_multi[2].first, "active");
  ASSERT_EQ(obj_multi[2].second.as_bool(), true);
  ASSERT_EQ(obj_multi[3].first, "extra");
  ASSERT_EQ(obj_multi[3].second.type(), JsonNode::Type::kNull);

  auto r_nested = JsonNode::ParseJson("{\"outer\": {\"inner\": [1, 2, {\"deep\": true}]}}");
  ASSERT_TRUE(r_nested.ok());
  ASSERT_EQ(r_nested->ToJson(), "{\"outer\": {\"inner\": [1,2,{\"deep\": true}]}}");
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
            "{\"id\": 1,\"tags\": [\"c++\",\"json\"]},"
            "{\"id\": 2,\"tags\": []}"
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
  ASSERT_EQ(node_hello.as_string(), "hello");
  ASSERT_EQ(node_hello.ToJson(), "\"hello\"");
  ASSERT_EQ(node_hello.ToToon(), "hello");
  ASSERT_EQ(node_hello.ToYaml(), "hello");

  // Slice 2: "\"world\"" parsed as JSON
  std::string_view sv_world(buffer.data() + 13, 7);
  auto parse_res = JsonNode::ParseJson(sv_world);
  ASSERT_TRUE(parse_res.ok());
  ASSERT_EQ(parse_res->as_string(), "world");

  // Slice 3: "12345" parsed as JSON
  std::string_view sv_num(buffer.data() + 24, 5);
  auto num_res = JsonNode::ParseJson(sv_num);
  ASSERT_TRUE(num_res.ok());
  ASSERT_EQ(num_res->as_number(), 12345.0);

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
  ASSERT_EQ(JsonNode(std::string_view("\xC0")).as_string(), "\xEF\xBF\xBD");
  ASSERT_EQ(JsonNode(std::string_view("\xE0\xA0")).as_string(), "\xEF\xBF\xBD");
  ASSERT_EQ(JsonNode(std::string_view("\xF0\x90\x80")).as_string(), "\xEF\xBF\xBD");
  ASSERT_EQ(JsonNode(std::string_view("\xFF")).as_string(), "\xEF\xBF\xBD");
  ASSERT_EQ(JsonNode(std::string_view("\x80")).as_string(), "\xEF\xBF\xBD");

  // Overlong UTF-8
  ASSERT_EQ(JsonNode(std::string_view("\xC0\xAF")).as_string(), "\xEF\xBF\xBD");
  ASSERT_EQ(JsonNode(std::string_view("\xE0\x80\xAF")).as_string(), "\xEF\xBF\xBD");
  ASSERT_EQ(JsonNode(std::string_view("\xF0\x80\x80\xAF")).as_string(), "\xEF\xBF\xBD");

  // UTF-8 encoded surrogates (U+D800 .. U+DFFF)
  ASSERT_EQ(JsonNode(std::string_view("\xED\xA0\x80")).as_string(), "\xEF\xBF\xBD");
  ASSERT_EQ(JsonNode(std::string_view("\xED\xBF\xBF")).as_string(), "\xEF\xBF\xBD");

  // Codepoints > U+10FFFF
  ASSERT_EQ(JsonNode(std::string_view("\xF4\x90\x80\x80")).as_string(), "\xEF\xBF\xBD");
  ASSERT_EQ(JsonNode(std::string_view("\xF5\x80\x80\x80")).as_string(), "\xEF\xBF\xBD");

  // JSON unicode surrogate pairs
  // Valid surrogate pair for musical symbol G clef U+1D11E (\uD834\uDD1E)
  auto res_clef = JsonNode::ParseJson("\"\\uD834\\uDD1E\"");
  ASSERT_TRUE(res_clef.ok());
  ASSERT_EQ(res_clef->as_string(), "\xF0\x9D\x84\x9E");

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
  ASSERT_EQ(exp1->as_number(), 1e-5);

  auto exp2 = JsonNode::ParseJson("-0.123e+4");
  ASSERT_TRUE(exp2.ok());
  ASSERT_EQ(exp2->as_number(), -1230.0);
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

inline typeprompt::ParseStatus ParseValue(const typeprompt::JsonNode& node,
                                          const typeprompt::JsonPath& context, Point& p) {
  if (node.type() != typeprompt::JsonNode::Type::kObject) {
    return context.MakeParseError("Expected object for Point");
  }
  for (const auto& [k, v] : node.as_object()) {
    if (k == "x") {
      typeprompt::internal::AtFieldJsonPath field_context(&context, "x");
      if (auto status = typeprompt::ParseValue(v, field_context, p.x); !status.ok()) return status;
    } else if (k == "y") {
      typeprompt::internal::AtFieldJsonPath field_context(&context, "y");
      if (auto status = typeprompt::ParseValue(v, field_context, p.y); !status.ok()) return status;
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
  ASSERT_EQ(from_node.as_number(), 42.0);

  // 2. bool overload
  JsonNode b_true = ToJsonNode(true);
  ASSERT_EQ(b_true.type(), JsonNode::Type::kBool);
  ASSERT_EQ(b_true.as_bool(), true);

  JsonNode b_false = ToJsonNode(false);
  ASSERT_EQ(b_false.type(), JsonNode::Type::kBool);
  ASSERT_EQ(b_false.as_bool(), false);

  // 3. double and int overloads
  JsonNode num_double = ToJsonNode(3.14159);
  ASSERT_EQ(num_double.type(), JsonNode::Type::kNumber);
  ASSERT_EQ(num_double.as_number(), 3.14159);

  JsonNode num_double2 = ToJsonNode(100.0);
  ASSERT_EQ(num_double2.type(), JsonNode::Type::kNumber);
  ASSERT_EQ(num_double2.as_number(), 100.0);

  JsonNode num_int = ToJsonNode(100);
  ASSERT_EQ(num_int.type(), JsonNode::Type::kNumber);
  ASSERT_EQ(num_int.as_number(), 100.0);

  // 4. std::string_view overload
  std::string_view sv = "sv_hello";
  JsonNode sv_res = ToJsonNode(sv);
  ASSERT_EQ(sv_res.type(), JsonNode::Type::kString);
  ASSERT_EQ(sv_res.as_string(), "sv_hello");

  std::string s = "std_string_val";
  JsonNode str_res = ToJsonNode(s);
  ASSERT_EQ(str_res.type(), JsonNode::Type::kString);
  ASSERT_EQ(str_res.as_string(), "std_string_val");

  JsonNode lit_res = ToJsonNode(std::string_view("string_literal"));
  ASSERT_EQ(lit_res.type(), JsonNode::Type::kString);
  ASSERT_EQ(lit_res.as_string(), "string_literal");

  // 5. std::optional<T> overload
  std::optional<double> opt_val = 55.0;
  JsonNode opt_res = ToJsonNode(opt_val);
  ASSERT_EQ(opt_res.type(), JsonNode::Type::kNumber);
  ASSERT_EQ(opt_res.as_number(), 55.0);

  std::optional<int> opt_int = 42;
  JsonNode opt_int_res = ToJsonNode(opt_int);
  ASSERT_EQ(opt_int_res.type(), JsonNode::Type::kNumber);
  ASSERT_EQ(opt_int_res.as_number(), 42.0);

  std::optional<std::string> opt_str = "opt_text";
  JsonNode opt_str_res = ToJsonNode(opt_str);
  ASSERT_EQ(opt_str_res.type(), JsonNode::Type::kString);
  ASSERT_EQ(opt_str_res.as_string(), "opt_text");

  std::optional<double> opt_empty = std::nullopt;
  JsonNode opt_empty_res = ToJsonNode(opt_empty);
  ASSERT_EQ(opt_empty_res.type(), JsonNode::Type::kNull);

  std::optional<JsonNode> opt_node = JsonNode("node_inside_opt");
  JsonNode opt_node_res = ToJsonNode(opt_node);
  ASSERT_EQ(opt_node_res.type(), JsonNode::Type::kString);
  ASSERT_EQ(opt_node_res.as_string(), "node_inside_opt");

  std::optional<JsonNode> opt_node_empty = std::nullopt;
  JsonNode opt_node_empty_res = ToJsonNode(opt_node_empty);
  ASSERT_EQ(opt_node_empty_res.type(), JsonNode::Type::kNull);

  // 6. std::vector<T> overload
  std::vector<double> vec_nums = {1.0, 2.0, 3.0};
  JsonNode vec_nums_res = ToJsonNode(vec_nums);
  ASSERT_EQ(vec_nums_res.type(), JsonNode::Type::kArray);
  ASSERT_EQ(vec_nums_res.as_array().size(), 3);
  ASSERT_EQ(vec_nums_res.as_array()[0].as_number(), 1.0);
  ASSERT_EQ(vec_nums_res.as_array()[1].as_number(), 2.0);
  ASSERT_EQ(vec_nums_res.as_array()[2].as_number(), 3.0);

  std::vector<int> vec_ints = {10, 20, 30};
  JsonNode vec_ints_res = ToJsonNode(vec_ints);
  ASSERT_EQ(vec_ints_res.type(), JsonNode::Type::kArray);
  ASSERT_EQ(vec_ints_res.as_array().size(), 3);
  ASSERT_EQ(vec_ints_res.as_array()[0].as_number(), 10.0);
  ASSERT_EQ(vec_ints_res.as_array()[1].as_number(), 20.0);
  ASSERT_EQ(vec_ints_res.as_array()[2].as_number(), 30.0);

  std::vector<std::string> vec_strs = {"alpha", "beta"};
  JsonNode vec_strs_res = ToJsonNode(vec_strs);
  ASSERT_EQ(vec_strs_res.type(), JsonNode::Type::kArray);
  ASSERT_EQ(vec_strs_res.as_array().size(), 2);
  ASSERT_EQ(vec_strs_res.as_array()[0].as_string(), "alpha");
  ASSERT_EQ(vec_strs_res.as_array()[1].as_string(), "beta");

  std::vector<std::optional<double>> vec_opts = {1.5, std::nullopt, 2.5};
  JsonNode vec_opts_res = ToJsonNode(vec_opts);
  ASSERT_EQ(vec_opts_res.type(), JsonNode::Type::kArray);
  ASSERT_EQ(vec_opts_res.as_array().size(), 3);
  ASSERT_EQ(vec_opts_res.as_array()[0].as_number(), 1.5);
  ASSERT_EQ(vec_opts_res.as_array()[1].type(), JsonNode::Type::kNull);
  ASSERT_EQ(vec_opts_res.as_array()[2].as_number(), 2.5);

  // 7. ADL with custom type
  test_custom_adl::Point pt{10.0, 20.0};
  JsonNode pt_res = ToJsonNode(pt);
  ASSERT_EQ(pt_res.type(), JsonNode::Type::kObject);
  ASSERT_EQ(pt_res.as_object().size(), 2);
  ASSERT_EQ(pt_res.as_object()[0].first, "x");
  ASSERT_EQ(pt_res.as_object()[0].second.as_number(), 10.0);
  ASSERT_EQ(pt_res.as_object()[1].first, "y");
  ASSERT_EQ(pt_res.as_object()[1].second.as_number(), 20.0);

  std::vector<test_custom_adl::Point> pts = {test_custom_adl::Point{1.0, 2.0},
                                             test_custom_adl::Point{3.0, 4.0}};
  JsonNode pts_res = ToJsonNode(pts);
  ASSERT_EQ(pts_res.type(), JsonNode::Type::kArray);
  ASSERT_EQ(pts_res.as_array().size(), 2);
  ASSERT_EQ(pts_res.as_array()[0].type(), JsonNode::Type::kObject);
  ASSERT_EQ(pts_res.as_array()[1].type(), JsonNode::Type::kObject);

  std::optional<test_custom_adl::Point> opt_pt = test_custom_adl::Point{5.0, 6.0};
  JsonNode opt_pt_res = ToJsonNode(opt_pt);
  ASSERT_EQ(opt_pt_res.type(), JsonNode::Type::kObject);
  ASSERT_EQ(opt_pt_res.as_object()[0].second.as_number(), 5.0);

  std::optional<test_custom_adl::Point> opt_pt_null = std::nullopt;
  JsonNode opt_pt_null_res = ToJsonNode(opt_pt_null);
  ASSERT_EQ(opt_pt_null_res.type(), JsonNode::Type::kNull);

  // 8. std::map<std::string, T> overload
  std::map<std::string, int> map_ints = {{"a", 1}, {"b", 2}};
  JsonNode map_ints_res = ToJsonNode(map_ints);
  ASSERT_EQ(map_ints_res.type(), JsonNode::Type::kObject);
  ASSERT_EQ(map_ints_res.as_object().size(), 2);
}

void TestTopLevelSerializers() {
  using typeprompt::ToJson;
  using typeprompt::ToPrettyJson;
  using typeprompt::ToToon;
  using typeprompt::ToYaml;

  // 1. Primitive types
  ASSERT_EQ(ToJson(42), "42");
  ASSERT_EQ(ToJson(true), "true");
  ASSERT_EQ(ToJson(std::string("hello")), "\"hello\"");

  // 2. Vector
  std::vector<int> vec = {1, 2, 3};
  ASSERT_EQ(ToJson(vec), "[1,2,3]");

  // 3. Custom ADL type
  test_custom_adl::Point pt{1.0, 2.0};
  ASSERT_EQ(ToJson(pt), "{\"x\": 1,\"y\": 2}");
  ASSERT_EQ(ToPrettyJson(pt), "{\n  \"x\": 1,\n  \"y\": 2\n}");
  ASSERT_EQ(ToToon(pt), "x: 1\ny: 2");
  ASSERT_EQ(ToYaml(pt), "x: 1\n\"y\": 2");
}

void TestParseValueOverloads() {
  using typeprompt::ParseValue;
  typeprompt::internal::RootJsonPath context;

  // 1. JsonNode
  JsonNode in_node(42.0);
  JsonNode out_node;
  auto status_node = ParseValue(in_node, context, out_node);
  ASSERT_TRUE(status_node.ok());
  ASSERT_EQ(out_node.as_number(), 42.0);

  // 2. bool
  bool out_b = false;
  ASSERT_TRUE(ParseValue(JsonNode(true), context, out_b).ok());
  ASSERT_EQ(out_b, true);
  ASSERT_TRUE(ParseValue(JsonNode(false), context, out_b).ok());
  ASSERT_EQ(out_b, false);
  ASSERT_FALSE(ParseValue(JsonNode(123.0), context, out_b).ok());

  // 3. int
  int out_int = 0;
  ASSERT_TRUE(ParseValue(JsonNode(42.0), context, out_int).ok());
  ASSERT_EQ(out_int, 42);
  ASSERT_FALSE(ParseValue(JsonNode("not a number"), context, out_int).ok());

  // 4. double
  double out_d = 0.0;
  ASSERT_TRUE(ParseValue(JsonNode(3.14159), context, out_d).ok());
  ASSERT_EQ(out_d, 3.14159);
  ASSERT_FALSE(ParseValue(JsonNode(true), context, out_d).ok());

  // 5. std::string
  std::string out_str;
  ASSERT_TRUE(ParseValue(JsonNode("hello"), context, out_str).ok());
  ASSERT_EQ(out_str, "hello");
  ASSERT_FALSE(ParseValue(JsonNode(123.0), context, out_str).ok());

  // 6. std::optional<T>
  std::optional<int> out_opt_int;
  ASSERT_TRUE(ParseValue(JsonNode(100.0), context, out_opt_int).ok());
  ASSERT_TRUE(out_opt_int.has_value());
  ASSERT_EQ(*out_opt_int, 100);

  ASSERT_TRUE(ParseValue(JsonNode(std::nullopt), context, out_opt_int).ok());
  ASSERT_FALSE(out_opt_int.has_value());

  std::optional<std::string> out_opt_str;
  ASSERT_TRUE(ParseValue(JsonNode("optional text"), context, out_opt_str).ok());
  ASSERT_TRUE(out_opt_str.has_value());
  ASSERT_EQ(*out_opt_str, "optional text");

  ASSERT_FALSE(ParseValue(JsonNode(42.0), context, out_opt_str).ok());

  // 7. std::vector<T>
  std::vector<int> out_vec_int;
  JsonNode arr_int(std::vector<JsonNode>{JsonNode(1.0), JsonNode(2.0), JsonNode(3.0)});
  ASSERT_TRUE(ParseValue(arr_int, context, out_vec_int).ok());
  ASSERT_EQ(out_vec_int.size(), 3);
  ASSERT_EQ(out_vec_int[0], 1);
  ASSERT_EQ(out_vec_int[1], 2);
  ASSERT_EQ(out_vec_int[2], 3);

  std::vector<std::string> out_vec_str;
  JsonNode arr_str(std::vector<JsonNode>{JsonNode("a"), JsonNode("b")});
  ASSERT_TRUE(ParseValue(arr_str, context, out_vec_str).ok());
  ASSERT_EQ(out_vec_str.size(), 2);
  ASSERT_EQ(out_vec_str[0], "a");
  ASSERT_EQ(out_vec_str[1], "b");

  ASSERT_FALSE(ParseValue(JsonNode("not an array"), context, out_vec_str).ok());

  JsonNode arr_bad(std::vector<JsonNode>{JsonNode("a"), JsonNode(123.0)});
  ASSERT_FALSE(ParseValue(arr_bad, context, out_vec_str).ok());

  // 8. ADL custom type
  test_custom_adl::Point pt;
  JsonNode pt_node(
      std::vector<std::pair<std::string, JsonNode>>{{"x", JsonNode(5.0)}, {"y", JsonNode(6.0)}});
  ASSERT_TRUE(ParseValue(pt_node, context, pt).ok());
  ASSERT_EQ(pt.x, 5.0);
  ASSERT_EQ(pt.y, 6.0);

  std::vector<test_custom_adl::Point> pts;
  JsonNode pts_node(std::vector<JsonNode>{
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{{"x", JsonNode(1.0)},
                                                             {"y", JsonNode(2.0)}}),
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{{"x", JsonNode(3.0)},
                                                             {"y", JsonNode(4.0)}}),
  });
  ASSERT_TRUE(ParseValue(pts_node, context, pts).ok());
  ASSERT_EQ(pts.size(), 2);
  ASSERT_EQ(pts[0].x, 1.0);
  ASSERT_EQ(pts[1].y, 4.0);

  std::optional<test_custom_adl::Point> opt_pt;
  ASSERT_TRUE(ParseValue(pt_node, context, opt_pt).ok());
  ASSERT_TRUE(opt_pt.has_value());
  ASSERT_EQ(opt_pt->x, 5.0);

  ASSERT_TRUE(ParseValue(JsonNode(std::nullopt), context, opt_pt).ok());
  ASSERT_FALSE(opt_pt.has_value());

  // 9. std::map<std::string, T>
  std::map<std::string, int> out_map_int;
  JsonNode map_node(JsonNode::Object{{"x", JsonNode(10.0)}, {"y", JsonNode(20.0)}});
  ASSERT_TRUE(ParseValue(map_node, context, out_map_int).ok());
  ASSERT_EQ(out_map_int.size(), 2);
  ASSERT_EQ(out_map_int["x"], 10);
  ASSERT_EQ(out_map_int["y"], 20);

  ASSERT_FALSE(ParseValue(JsonNode(123.0), context, out_map_int).ok());
  JsonNode map_node_bad(JsonNode::Object{{"x", JsonNode("not an int")}});
  ASSERT_FALSE(ParseValue(map_node_bad, context, out_map_int).ok());
}

void TestParseSingleArgOverloads() {
  using typeprompt::Parse;
  using typeprompt::ParseJson;

  // --- 1. Parse<T>(const JsonNode&) ---
  auto res_int = Parse<int>(JsonNode(42.0));
  ASSERT_TRUE(res_int.ok());
  ASSERT_EQ(*res_int, 42);

  auto res_int_err = Parse<int>(JsonNode("not an int"));
  ASSERT_FALSE(res_int_err.ok());

  auto res_bool = Parse<bool>(JsonNode(true));
  ASSERT_TRUE(res_bool.ok());
  ASSERT_EQ(*res_bool, true);

  auto res_double = Parse<double>(JsonNode(2.718));
  ASSERT_TRUE(res_double.ok());
  ASSERT_EQ(*res_double, 2.718);

  auto res_str = Parse<std::string>(JsonNode("hello world"));
  ASSERT_TRUE(res_str.ok());
  ASSERT_EQ(*res_str, "hello world");

  // Optional
  auto res_opt_val = Parse<std::optional<int>>(JsonNode(123.0));
  ASSERT_TRUE(res_opt_val.ok());
  ASSERT_TRUE(res_opt_val->has_value());
  ASSERT_EQ(**res_opt_val, 123);

  auto res_opt_null = Parse<std::optional<int>>(JsonNode(std::nullopt));
  ASSERT_TRUE(res_opt_null.ok());
  ASSERT_FALSE(res_opt_null->has_value());

  // Vector
  JsonNode arr_node(std::vector<JsonNode>{JsonNode(10.0), JsonNode(20.0)});
  auto res_vec = Parse<std::vector<int>>(arr_node);
  ASSERT_TRUE(res_vec.ok());
  ASSERT_EQ(res_vec->size(), 2);
  ASSERT_EQ((*res_vec)[0], 10);
  ASSERT_EQ((*res_vec)[1], 20);

  // Custom ADL type
  JsonNode pt_node(
      std::vector<std::pair<std::string, JsonNode>>{{"x", JsonNode(3.0)}, {"y", JsonNode(4.0)}});
  auto res_pt = Parse<test_custom_adl::Point>(pt_node);
  ASSERT_TRUE(res_pt.ok());
  ASSERT_EQ(res_pt->x, 3.0);
  ASSERT_EQ(res_pt->y, 4.0);

  // --- 2. ParseJson<T>(std::string_view) ---
  auto res_json_int = ParseJson<int>("42");
  ASSERT_TRUE(res_json_int.ok());
  ASSERT_EQ(*res_json_int, 42);

  auto res_json_double = ParseJson<double>("3.14159");
  ASSERT_TRUE(res_json_double.ok());
  ASSERT_EQ(*res_json_double, 3.14159);

  auto res_json_bool = ParseJson<bool>("true");
  ASSERT_TRUE(res_json_bool.ok());
  ASSERT_EQ(*res_json_bool, true);

  auto res_json_str = ParseJson<std::string>("\"hello from json\"");
  ASSERT_TRUE(res_json_str.ok());
  ASSERT_EQ(*res_json_str, "hello from json");

  auto res_json_vec = ParseJson<std::vector<std::string>>("[\"abc\", \"def\"]");
  ASSERT_TRUE(res_json_vec.ok());
  ASSERT_EQ(res_json_vec->size(), 2);
  ASSERT_EQ((*res_json_vec)[0], "abc");
  ASSERT_EQ((*res_json_vec)[1], "def");

  auto res_json_pt = ParseJson<test_custom_adl::Point>("{\"x\": 7.5, \"y\": 8.5}");
  ASSERT_TRUE(res_json_pt.ok());
  ASSERT_EQ(res_pt->x, 3.0);
  ASSERT_EQ(res_json_pt->x, 7.5);
  ASSERT_EQ(res_json_pt->y, 8.5);

  // Error cases for JSON string parsing
  auto res_json_malformed = ParseJson<int>("{not valid json");
  ASSERT_FALSE(res_json_malformed.ok());

  auto res_json_type_mismatch = ParseJson<int>("\"not a number\"");
  ASSERT_FALSE(res_json_type_mismatch.ok());

  auto res_json_pt_mismatch = ParseJson<test_custom_adl::Point>("[1, 2, 3]");
  ASSERT_FALSE(res_json_pt_mismatch.ok());
}

void TestStructParser() {
  using typeprompt::internal::RootJsonPath;
  using typeprompt::internal::StructParser;

  RootJsonPath context;

  // 1. Successful parse of required and optional fields (in alphabetical order)
  JsonNode::Object obj1 = {
      {"name", JsonNode("Alice")},
      {"age", JsonNode(30.0)},
      {"email", JsonNode("alice@example.com")},
  };
  JsonNode node1(obj1);
  StructParser parser1(&node1, context);
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
  JsonNode node2(obj2);
  StructParser parser2(&node2, context);
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
  JsonNode node3(obj3);
  StructParser parser3(&node3, context);
  std::string name3;
  parser3.Parse("name", name3);

  auto status3 = std::move(parser3).status();
  ASSERT_TRUE(status3.ok());
  ASSERT_EQ(name3, "Charlie");

  // 4. Missing required field
  JsonNode::Object obj4 = {
      {"email", JsonNode("dave@example.com")},
  };
  JsonNode node4(obj4);
  StructParser parser4(&node4, context);
  std::optional<std::string> email4;
  std::string name4;
  parser4.ParseOptional("email", email4);
  parser4.Parse("name", name4);

  auto status4 = std::move(parser4).status();
  ASSERT_FALSE(status4.ok());
  ASSERT_EQ(status4.error().message, "Missing key: name at json");

  // 5. Type mismatch error on field
  JsonNode::Object obj5 = {
      {"age", JsonNode("not_a_number")},
      {"name", JsonNode("Eve")},
  };
  JsonNode node5(obj5);
  StructParser parser5(&node5, context);
  int age5 = 0;
  std::string name5;
  parser5.Parse("age", age5);
  parser5.Parse("name", name5);

  auto status5 = std::move(parser5).status();
  ASSERT_FALSE(status5.ok());
  ASSERT_EQ(status5.error().message, "Expected number at json.age");

  // 6. Empty object
  JsonNode::Object empty_obj;
  JsonNode node6(empty_obj);
  StructParser parser6(&node6, context);
  std::optional<int> empty_opt;
  std::string req_str;
  parser6.ParseOptional("a", empty_opt);
  parser6.Parse("b", req_str);

  auto status6 = std::move(parser6).status();
  ASSERT_FALSE(status6.ok());
  ASSERT_EQ(status6.error().message, "Missing key: b at json");

  // 7. Not an object
  JsonNode node7(3);
  StructParser parser7(&node7, context);
  std::string foo7;
  parser7.ParseOptional("a", foo7);
  parser7.Parse("b", foo7);

  auto status7 = std::move(parser7).status();
  ASSERT_FALSE(status7.ok());
  ASSERT_EQ(status7.error().message, "Expected object at json");
}

void TestJsonPathErrorFormatting() {
  using typeprompt::ParseValue;
  using typeprompt::internal::AtFieldJsonPath;
  using typeprompt::internal::AtIndexJsonPath;
  using typeprompt::internal::RootJsonPath;

  RootJsonPath root;

  // Root error
  int i = 0;
  auto status_root = ParseValue(JsonNode("bad"), root, i);
  ASSERT_FALSE(status_root.ok());
  ASSERT_EQ(status_root.error().message, "Expected number at json");

  // Field error
  AtFieldJsonPath field_path(&root, "foo");
  auto status_field = ParseValue(JsonNode("bad"), field_path, i);
  ASSERT_FALSE(status_field.ok());
  ASSERT_EQ(status_field.error().message, "Expected number at json.foo");

  // Index error
  AtIndexJsonPath index_path(&root, 3);
  auto status_index = ParseValue(JsonNode("bad"), index_path, i);
  ASSERT_FALSE(status_index.ok());
  ASSERT_EQ(status_index.error().message, "Expected number at json[3]");

  // Nested: json.users[2].age
  AtFieldJsonPath users_path(&root, "users");
  AtIndexJsonPath user2_path(&users_path, 2);
  AtFieldJsonPath age_path(&user2_path, "age");
  auto status_nested = ParseValue(JsonNode("bad"), age_path, i);
  ASSERT_FALSE(status_nested.ok());
  ASSERT_EQ(status_nested.error().message, "Expected number at json.users[2].age");

  // Vector parse error with nested index
  std::vector<int> vec;
  JsonNode bad_vec_node(std::vector<JsonNode>{JsonNode(1.0), JsonNode("not_num"), JsonNode(3.0)});
  auto status_vec = ParseValue(bad_vec_node, root, vec);
  ASSERT_FALSE(status_vec.ok());
  ASSERT_EQ(status_vec.error().message, "Expected number at json[1]");

  // Map parse error with nested field
  std::map<std::string, int> map_val;
  JsonNode bad_map_node(JsonNode::Object{{"good", JsonNode(1.0)}, {"bad", JsonNode(true)}});
  auto status_map = ParseValue(bad_map_node, root, map_val);
  ASSERT_FALSE(status_map.ok());
  ASSERT_EQ(status_map.error().message, "Expected number at json.bad");
}

void TestUnions() {
  using typeprompt::internal::RootJsonPath;
  using typeprompt::internal::Unions;

  RootJsonPath context;

  // 1. FindStringDiscriminant - success
  JsonNode valid_str_disc(JsonNode::Object{
      {"type", JsonNode("circle")},
      {"radius", JsonNode(5.0)},
  });
  auto str_disc_res = Unions::FindStringDiscriminant(valid_str_disc, context, "type");
  ASSERT_TRUE(str_disc_res.ok());
  ASSERT_EQ(*str_disc_res, "circle");

  // 2. FindStringDiscriminant - not a string
  JsonNode num_str_disc(JsonNode::Object{
      {"type", JsonNode(123.0)},
  });
  auto num_disc_res = Unions::FindStringDiscriminant(num_str_disc, context, "type");
  ASSERT_FALSE(num_disc_res.ok());
  ASSERT_EQ(num_disc_res.error().message, "Expected string at json.type");

  // 3. FindStringDiscriminant - missing key
  auto missing_str_res = Unions::FindStringDiscriminant(valid_str_disc, context, "kind");
  ASSERT_FALSE(missing_str_res.ok());
  ASSERT_EQ(missing_str_res.error().message, "Missing key: kind at json");

  // 4. FindStringDiscriminant - not an object
  auto not_obj_str_res = Unions::FindStringDiscriminant(JsonNode("string"), context, "type");
  ASSERT_FALSE(not_obj_str_res.ok());
  ASSERT_EQ(not_obj_str_res.error().message, "Expected object at json");

  // 5. FindBoolDiscriminant - success (true and false)
  JsonNode valid_bool_disc(JsonNode::Object{
      {"active", JsonNode(true)},
      {"score", JsonNode(100.0)},
  });
  auto bool_disc_res = Unions::FindBoolDiscriminant(valid_bool_disc, context, "active");
  ASSERT_TRUE(bool_disc_res.ok());
  ASSERT_EQ(*bool_disc_res, true);

  JsonNode valid_bool_false(JsonNode::Object{
      {"active", JsonNode(false)},
  });
  auto bool_false_res = Unions::FindBoolDiscriminant(valid_bool_false, context, "active");
  ASSERT_TRUE(bool_false_res.ok());
  ASSERT_EQ(*bool_false_res, false);

  // 6. FindBoolDiscriminant - not a bool
  JsonNode str_bool_disc(JsonNode::Object{
      {"active", JsonNode("yes")},
  });
  auto str_bool_res = Unions::FindBoolDiscriminant(str_bool_disc, context, "active");
  ASSERT_FALSE(str_bool_res.ok());
  ASSERT_EQ(str_bool_res.error().message, "Expected boolean at json.active");

  // 7. FindBoolDiscriminant - missing key
  auto missing_bool_res = Unions::FindBoolDiscriminant(valid_bool_disc, context, "enabled");
  ASSERT_FALSE(missing_bool_res.ok());
  ASSERT_EQ(missing_bool_res.error().message, "Missing key: enabled at json");

  // 8. FindBoolDiscriminant - not an object
  auto not_obj_bool_res = Unions::FindBoolDiscriminant(JsonNode(true), context, "active");
  ASSERT_FALSE(not_obj_bool_res.ok());
  ASSERT_EQ(not_obj_bool_res.error().message, "Expected object at json");
}

void TestIndirect() {
  using typeprompt::indirect;

  // Default construction
  indirect<int> ind_default;
  ASSERT_EQ(*ind_default, 0);

  // Value construction
  indirect<std::string> ind_str("hello");
  ASSERT_EQ(*ind_str, "hello");
  ASSERT_EQ(ind_str->length(), 5);

  // Const accessors
  const indirect<std::string> const_ind("constant");
  ASSERT_EQ(*const_ind, "constant");
  ASSERT_EQ(const_ind->size(), 8);

  // Mutable dereference
  *ind_str = "modified";
  ASSERT_EQ(*ind_str, "modified");

  // Copy construction (deep copy)
  indirect<std::string> ind_copy(ind_str);
  ASSERT_EQ(*ind_copy, "modified");
  *ind_copy = "world";
  ASSERT_EQ(*ind_str, "modified");
  ASSERT_EQ(*ind_copy, "world");

  // Copy assignment (deep copy & self-assignment)
  indirect<std::string> ind_assigned;
  ind_assigned = ind_copy;
  ASSERT_EQ(*ind_assigned, "world");
  ind_assigned = ind_assigned;
  ASSERT_EQ(*ind_assigned, "world");

  // Move construction
  indirect<std::string> ind_moved(std::move(ind_str));
  ASSERT_EQ(*ind_moved, "modified");

  // Move assignment
  indirect<std::string> ind_move_assigned;
  ind_move_assigned = std::move(ind_copy);
  ASSERT_EQ(*ind_move_assigned, "world");

  // Rvalue dereference
  std::string val = *std::move(ind_moved);
  ASSERT_EQ(val, "modified");
}

void TestMustInit() {
  using typeprompt::must_init;

  // Initializing with value
  must_init<int> mi_int(42);
  static_assert(std::is_same_v<typename must_init<int>::value_type, int>);
  int val_int = *std::move(mi_int);
  ASSERT_EQ(val_int, 42);

  // Initializing with string
  must_init<std::string> mi_str("test_init");
  std::string val_str = *std::move(mi_str);
  ASSERT_EQ(val_str, "test_init");

  // Initializing with move
  std::string orig = "movable";
  must_init<std::string> mi_moved(std::move(orig));
  ASSERT_EQ(*std::move(mi_moved), "movable");
}

template <class... Ts>
struct overloaded : Ts... {
  using Ts::operator()...;
};

void TestPageNodeVisit() {
  using namespace typeprompt_02::schema::generate_page_tree;

  PageNode_KindHeading heading{.level = PageNode_KindHeading_Level::kH1, .text = "Title"};
  PageNode node = PageNode::variant_type(typeprompt_02::indirect<PageNode_KindHeading>(heading));

  // Test const& visit
  const PageNode& const_node = node;
  std::string result = const_node.visit(overloaded{
      [](const PageNode_KindHeading& h) -> std::string { return "heading: " + h.text; },
      [](const PageNode_KindParagraph& p) -> std::string { return "paragraph: " + p.text; },
      [](const PageNode_KindButton& b) -> std::string { return "button: " + b.label; },
      [](const PageNode_KindSection& s) -> std::string { return "section"; },
  });
  ASSERT_EQ(result, "heading: Title");

  // Test & (mutable) visit
  node.visit(overloaded{
      [](PageNode_KindHeading& h) { h.text = "Updated Title"; },
      [](PageNode_KindParagraph&) {},
      [](PageNode_KindButton&) {},
      [](PageNode_KindSection&) {},
  });
  ASSERT_EQ(node.as_kind_heading().text, "Updated Title");

  // Test && (rvalue) visit
  std::string moved_text = std::move(node).visit(overloaded{
      [](PageNode_KindHeading&& h) { return std::move(h.text); },
      [](PageNode_KindParagraph&&) { return std::string(); },
      [](PageNode_KindButton&&) { return std::string(); },
      [](PageNode_KindSection&&) { return std::string(); },
  });
  ASSERT_EQ(moved_text, "Updated Title");
}

void TestUserDefinedEnums() {
  using namespace typeprompt_02::schema::meta;
  using namespace typeprompt_02::schema::triage_ticket;
  using namespace typeprompt_02::schema::generate_page_tree;

  // 1. Meta_Model
  ASSERT_EQ(typeprompt_02::ToJson(Meta_Model::kGpt4o), "\"gpt-4o\"");
  ASSERT_EQ(typeprompt_02::ToJson(Meta_Model::kGpt4oMini), "\"gpt-4o-mini\"");
  ASSERT_EQ(typeprompt_02::ToToon(Meta_Model::kGpt4o), "gpt-4o");
  ASSERT_EQ(typeprompt_02::ToYaml(Meta_Model::kGpt4oMini), "gpt-4o-mini");

  auto parsed_gpt4o = typeprompt_02::ParseJson<Meta_Model>("\"gpt-4o\"");
  ASSERT_TRUE(parsed_gpt4o.ok());
  ASSERT_TRUE(*parsed_gpt4o == Meta_Model::kGpt4o);

  auto parsed_gpt4o_mini = typeprompt_02::ParseJson<Meta_Model>("\"gpt-4o-mini\"");
  ASSERT_TRUE(parsed_gpt4o_mini.ok());
  ASSERT_TRUE(*parsed_gpt4o_mini == Meta_Model::kGpt4oMini);

  auto parsed_err_type = typeprompt_02::ParseJson<Meta_Model>("123");
  ASSERT_FALSE(parsed_err_type.ok());
  ASSERT_EQ(parsed_err_type.error().message, "Expected string at json");

  auto parsed_err_unknown = typeprompt_02::ParseJson<Meta_Model>("\"claude-3\"");
  ASSERT_FALSE(parsed_err_unknown.ok());
  ASSERT_EQ(parsed_err_unknown.error().message, "Unknown constant 'claude-3' at json");

  // 2. TicketCategory
  ASSERT_EQ(typeprompt_02::ToJson(TicketCategory::kBilling), "\"billing\"");
  ASSERT_EQ(typeprompt_02::ToJson(TicketCategory::kTechnicalIssue), "\"technical-issue\"");
  ASSERT_EQ(typeprompt_02::ToJson(TicketCategory::kFeatureRequest), "\"feature-request\"");
  ASSERT_EQ(typeprompt_02::ToJson(TicketCategory::kOther), "\"other\"");

  auto parsed_cat = typeprompt_02::ParseJson<TicketCategory>("\"feature-request\"");
  ASSERT_TRUE(parsed_cat.ok());
  ASSERT_TRUE(*parsed_cat == TicketCategory::kFeatureRequest);

  // 3. CustomerTier & Output_Urgency
  ASSERT_EQ(typeprompt_02::ToJson(Input_CustomerTier::kEnterprise), "\"enterprise\"");
  auto parsed_tier = typeprompt_02::ParseJson<Input_CustomerTier>("\"enterprise\"");
  ASSERT_TRUE(parsed_tier.ok());
  ASSERT_TRUE(*parsed_tier == Input_CustomerTier::kEnterprise);

  ASSERT_EQ(typeprompt_02::ToJson(Output_Urgency::kCritical), "\"critical\"");
  auto parsed_urg = typeprompt_02::ParseJson<Output_Urgency>("\"critical\"");
  ASSERT_TRUE(parsed_urg.ok());
  ASSERT_TRUE(*parsed_urg == Output_Urgency::kCritical);

  // 4. ProductCategory, Pricing_Model, PageNode_KindHeading_Level, Input_Audience
  ASSERT_EQ(typeprompt_02::ToJson(ProductCategory::kDatabase), "\"database\"");
  auto parsed_prod = typeprompt_02::ParseJson<ProductCategory>("\"database\"");
  ASSERT_TRUE(parsed_prod.ok());
  ASSERT_TRUE(*parsed_prod == ProductCategory::kDatabase);

  ASSERT_EQ(typeprompt_02::ToJson(Pricing_Model::kPerHour), "\"perHour\"");
  auto parsed_pm = typeprompt_02::ParseJson<Pricing_Model>("\"perHour\"");
  ASSERT_TRUE(parsed_pm.ok());
  ASSERT_TRUE(*parsed_pm == Pricing_Model::kPerHour);

  ASSERT_EQ(typeprompt_02::ToJson(PageNode_KindHeading_Level::kH2), "\"h2\"");
  auto parsed_lvl = typeprompt_02::ParseJson<PageNode_KindHeading_Level>("\"h2\"");
  ASSERT_TRUE(parsed_lvl.ok());
  ASSERT_TRUE(*parsed_lvl == PageNode_KindHeading_Level::kH2);

  ASSERT_EQ(typeprompt_02::ToJson(Input_Audience::kDeveloper), "\"developer\"");
  auto parsed_aud = typeprompt_02::ParseJson<Input_Audience>("\"developer\"");
  ASSERT_TRUE(parsed_aud.ok());
  ASSERT_TRUE(*parsed_aud == Input_Audience::kDeveloper);
}

void TestUserDefinedStructs() {
  using namespace typeprompt_02::schema::meta;
  using namespace typeprompt_02::schema::triage_ticket;
  using namespace typeprompt_02::schema::generate_page_tree;

  // 1. Meta struct whole builder & serialization
  Meta m1 = *Meta::whole{
      .model = Meta_Model::kGpt4o,
      .temperature = 0.5,
  };
  ASSERT_TRUE(m1.model == Meta_Model::kGpt4o);
  ASSERT_TRUE(m1.temperature.has_value());
  ASSERT_EQ(*m1.temperature, 0.5);

  Meta m2 = Meta::whole{
      .model = Meta_Model::kGpt4oMini,
      .temperature = std::nullopt,
  };
  ASSERT_TRUE(m2.model == Meta_Model::kGpt4oMini);
  ASSERT_FALSE(m2.temperature.has_value());

  // Serialization & Deserialization
  typeprompt_02::JsonNode m1_node = ToJsonNode(m1);
  ASSERT_TRUE(m1_node.type() == typeprompt_02::JsonNode::Type::kObject);
  auto parsed_m1 = typeprompt_02::Parse<Meta>(m1_node);
  ASSERT_TRUE(parsed_m1.ok());
  ASSERT_TRUE(parsed_m1->model == Meta_Model::kGpt4o);
  ASSERT_TRUE(parsed_m1->temperature.has_value());
  ASSERT_EQ(*parsed_m1->temperature, 0.5);

  auto parsed_m2_json = typeprompt_02::ParseJson<Meta>("{\"model\": \"gpt-4o-mini\"}");
  ASSERT_TRUE(parsed_m2_json.ok());
  ASSERT_TRUE(parsed_m2_json->model == Meta_Model::kGpt4oMini);
  ASSERT_FALSE(parsed_m2_json->temperature.has_value());

  // 2. Struct with nested structs & arrays (Pricing, Benchmark, Provider)
  Pricing pricing = *Pricing::whole{
      .model = Pricing_Model::kPerMonth,
      .base_price = 49.99,
      .overage = 0.10,
  };

  Benchmark b1 = *Benchmark::whole{
      .name = "Latency",
      .score = 15.2,
      .unit = "ms",
  };
  Benchmark b2 = *Benchmark::whole{
      .name = "Throughput",
      .score = 5000.0,
      .unit = "req/s",
  };

  Provider provider = *Provider::whole{
      .name = "AcmeCloud",
      .region = "us-east-1",
      .category = ProductCategory::kCompute,
      .pricing = pricing,
      .benchmarks = std::vector<Benchmark>{b1, b2},
      .pros = std::vector<std::string>{"fast", "reliable"},
      .cons = std::vector<std::string>{"expensive"},
  };

  typeprompt_02::JsonNode prov_node = ToJsonNode(provider);
  auto parsed_prov = typeprompt_02::Parse<Provider>(prov_node);
  ASSERT_TRUE(parsed_prov.ok());
  ASSERT_EQ(parsed_prov->name, "AcmeCloud");
  ASSERT_EQ(parsed_prov->region, "us-east-1");
  ASSERT_TRUE(parsed_prov->category == ProductCategory::kCompute);
  ASSERT_TRUE(parsed_prov->pricing.model == Pricing_Model::kPerMonth);
  ASSERT_EQ(parsed_prov->pricing.base_price, 49.99);
  ASSERT_TRUE(parsed_prov->pricing.overage.has_value());
  ASSERT_EQ(*parsed_prov->pricing.overage, 0.10);
  ASSERT_EQ(parsed_prov->benchmarks.size(), 2);
  ASSERT_EQ(parsed_prov->benchmarks[0].name, "Latency");
  ASSERT_EQ(parsed_prov->benchmarks[0].score, 15.2);
  ASSERT_EQ(parsed_prov->benchmarks[1].unit, "req/s");
  ASSERT_EQ(parsed_prov->pros.size(), 2);
  ASSERT_EQ(parsed_prov->cons.size(), 1);

  // 3. Triage ticket Input & Output
  Input_RecentTickets rt1 = *Input_RecentTickets::whole{
      .id = "TICKET-1",
      .summary = "Cannot login",
      .category = TicketCategory::kTechnicalIssue,
  };
  typeprompt_02::schema::triage_ticket::Input ticket_input =
      *typeprompt_02::schema::triage_ticket::Input::whole{
          .subject = "Urgent billing inquiry",
          .body = "Need invoice for March",
          .customer_tier = Input_CustomerTier::kPro,
          .recent_tickets = std::vector<Input_RecentTickets>{rt1},
      };

  typeprompt_02::JsonNode ticket_input_node = ToJsonNode(ticket_input);
  auto parsed_ticket_input =
      typeprompt_02::Parse<typeprompt_02::schema::triage_ticket::Input>(ticket_input_node);
  ASSERT_TRUE(parsed_ticket_input.ok());
  ASSERT_EQ(parsed_ticket_input->subject, "Urgent billing inquiry");
  ASSERT_TRUE(parsed_ticket_input->customer_tier == Input_CustomerTier::kPro);
  ASSERT_EQ(parsed_ticket_input->recent_tickets.size(), 1);
  ASSERT_EQ(parsed_ticket_input->recent_tickets[0].id, "TICKET-1");

  typeprompt_02::schema::triage_ticket::Output ticket_output =
      *typeprompt_02::schema::triage_ticket::Output::whole{
          .category = TicketCategory::kBilling,
          .urgency = Output_Urgency::kHigh,
          .summary = "Billing inquiry summary",
          .suggested_actions = std::vector<std::string>{"Send invoice", "Follow up"},
          .suggested_reply = std::optional<std::string>("Here is your invoice."),
      };
  typeprompt_02::JsonNode ticket_output_node = ToJsonNode(ticket_output);
  auto parsed_ticket_output =
      typeprompt_02::Parse<typeprompt_02::schema::triage_ticket::Output>(ticket_output_node);
  ASSERT_TRUE(parsed_ticket_output.ok());
  ASSERT_TRUE(parsed_ticket_output->category == TicketCategory::kBilling);
  ASSERT_TRUE(parsed_ticket_output->urgency == Output_Urgency::kHigh);
  ASSERT_EQ(parsed_ticket_output->summary, "Billing inquiry summary");
  ASSERT_EQ(parsed_ticket_output->suggested_actions.size(), 2);
  ASSERT_EQ(parsed_ticket_output->suggested_actions[0], "Send invoice");
  ASSERT_TRUE(parsed_ticket_output->suggested_reply.has_value());
  ASSERT_EQ(*parsed_ticket_output->suggested_reply, "Here is your invoice.");

  // Top-level serialization formats test
  ASSERT_EQ(typeprompt_02::ToJson(m2), "{\"model\": \"gpt-4o-mini\",\"temperature\": null}");
  ASSERT_EQ(typeprompt_02::ToYaml(b1),
            "name: Latency\n"
            "score: 15.2\n"
            "unit: ms");
  ASSERT_EQ(typeprompt_02::ToToon(b1),
            "name: Latency\n"
            "score: 15.2\n"
            "unit: ms");

  // 4. Generate page tree Input
  typeprompt_02::schema::generate_page_tree::Input page_input =
      *typeprompt_02::schema::generate_page_tree::Input::whole{
          .providers = std::vector<Provider>{provider},
          .use_case = "Cloud hosting for microservices",
          .audience = Input_Audience::kDeveloper,
      };
  typeprompt_02::JsonNode page_input_node = ToJsonNode(page_input);
  auto parsed_page_input =
      typeprompt_02::Parse<typeprompt_02::schema::generate_page_tree::Input>(page_input_node);
  ASSERT_TRUE(parsed_page_input.ok());
  ASSERT_EQ(parsed_page_input->providers.size(), 1);
  ASSERT_EQ(parsed_page_input->providers[0].name, "AcmeCloud");
  ASSERT_EQ(parsed_page_input->use_case, "Cloud hosting for microservices");
  ASSERT_TRUE(parsed_page_input->audience == Input_Audience::kDeveloper);

  // 4. Error reporting with JsonPath context
  auto missing_field_err =
      typeprompt_02::ParseJson<Benchmark>("{\"score\": 10.0, \"unit\": \"s\"}");
  ASSERT_FALSE(missing_field_err.ok());
  ASSERT_EQ(missing_field_err.error().message, "Missing key: name at json");

  auto field_type_err = typeprompt_02::ParseJson<Benchmark>(
      "{\"name\": \"test\", \"score\": \"not_a_num\", \"unit\": \"s\"}");
  ASSERT_FALSE(field_type_err.ok());
  ASSERT_EQ(field_type_err.error().message, "Expected number at json.score");

  auto nested_err = typeprompt_02::ParseJson<Provider>(
      "{\"name\": \"A\", \"region\": \"B\", \"category\": \"compute\", "
      "\"pricing\": {\"model\": \"unknown\", \"basePrice\": 10.0}, "
      "\"benchmarks\": [], \"pros\": [], \"cons\": []}");
  ASSERT_FALSE(nested_err.ok());
  ASSERT_EQ(nested_err.error().message, "Unknown constant 'unknown' at json.pricing.model");

  auto nested_array_err = typeprompt_02::ParseJson<Provider>(
      "{\"name\": \"A\", \"region\": \"B\", \"category\": \"compute\", "
      "\"pricing\": {\"model\": \"perMonth\", \"basePrice\": 10.0}, "
      "\"benchmarks\": [{\"name\": \"b1\", \"score\": \"invalid\", \"unit\": \"ms\"}], "
      "\"pros\": [], \"cons\": []}");
  ASSERT_FALSE(nested_array_err.ok());
  ASSERT_EQ(nested_array_err.error().message, "Expected number at json.benchmarks[0].score");
}

void TestUserDefinedDiscriminatedUnionPageNode() {
  using namespace typeprompt_02::schema::generate_page_tree;

  // 1. Leaf node construction & properties
  PageNode heading = PageNode::variant_type(
      typeprompt_02::indirect<PageNode_KindHeading>(*PageNode_KindHeading::whole{
          .level = PageNode_KindHeading_Level::kH1,
          .text = "Page Title",
      }));
  ASSERT_TRUE(heading.kind() == PageNode::kind::kHeading);
  ASSERT_EQ(heading.as_kind_heading().text, "Page Title");
  ASSERT_TRUE(heading.as_kind_heading().level == PageNode_KindHeading_Level::kH1);

  PageNode paragraph = PageNode::variant_type(
      typeprompt_02::indirect<PageNode_KindParagraph>(*PageNode_KindParagraph::whole{
          .text = "This is a paragraph of content.",
      }));
  ASSERT_TRUE(paragraph.kind() == PageNode::kind::kParagraph);
  ASSERT_EQ(paragraph.as_kind_paragraph().text, "This is a paragraph of content.");

  PageNode button = PageNode::variant_type(
      typeprompt_02::indirect<PageNode_KindButton>(*PageNode_KindButton::whole{
          .label = "Sign Up",
          .url = "https://example.com/signup",
      }));
  ASSERT_TRUE(button.kind() == PageNode::kind::kButton);
  ASSERT_EQ(button.as_kind_button().label, "Sign Up");
  ASSERT_EQ(button.as_kind_button().url, "https://example.com/signup");

  // 2. Recursive section containing heading, paragraph, button, and a nested subsection
  PageNode subsection = PageNode::variant_type(
      typeprompt_02::indirect<PageNode_KindSection>(*PageNode_KindSection::whole{
          .title = std::optional<std::string>("Subsection"),
          .children = std::vector<PageNode>{button},
      }));
  ASSERT_TRUE(subsection.kind() == PageNode::kind::kSection);
  ASSERT_TRUE(subsection.as_kind_section().title.has_value());
  ASSERT_EQ(*subsection.as_kind_section().title, "Subsection");
  ASSERT_EQ(subsection.as_kind_section().children.size(), 1);

  PageNode root_section = PageNode::variant_type(
      typeprompt_02::indirect<PageNode_KindSection>(*PageNode_KindSection::whole{
          .title = std::optional<std::string>("Main Section"),
          .children = std::vector<PageNode>{heading, paragraph, subsection},
      }));

  // 3. Serialization and Deserialization roundtrip
  typeprompt_02::JsonNode section_json = ToJsonNode(root_section);
  auto parsed_section = typeprompt_02::Parse<PageNode>(section_json);
  ASSERT_TRUE(parsed_section.ok());
  ASSERT_TRUE(parsed_section->kind() == PageNode::kind::kSection);
  ASSERT_TRUE(parsed_section->as_kind_section().title.has_value());
  ASSERT_EQ(*parsed_section->as_kind_section().title, "Main Section");
  ASSERT_EQ(parsed_section->as_kind_section().children.size(), 3);

  const auto& child0 = parsed_section->as_kind_section().children[0];
  ASSERT_TRUE(child0.kind() == PageNode::kind::kHeading);
  ASSERT_EQ(child0.as_kind_heading().text, "Page Title");
  ASSERT_TRUE(child0.as_kind_heading().level == PageNode_KindHeading_Level::kH1);

  const auto& child1 = parsed_section->as_kind_section().children[1];
  ASSERT_TRUE(child1.kind() == PageNode::kind::kParagraph);
  ASSERT_EQ(child1.as_kind_paragraph().text, "This is a paragraph of content.");

  const auto& child2 = parsed_section->as_kind_section().children[2];
  ASSERT_TRUE(child2.kind() == PageNode::kind::kSection);
  ASSERT_TRUE(child2.as_kind_section().title.has_value());
  ASSERT_EQ(*child2.as_kind_section().title, "Subsection");
  ASSERT_EQ(child2.as_kind_section().children.size(), 1);
  ASSERT_TRUE(child2.as_kind_section().children[0].kind() == PageNode::kind::kButton);
  ASSERT_EQ(child2.as_kind_section().children[0].as_kind_button().label, "Sign Up");

  // 4. Visiting the tree
  int node_count = 0;
  auto count_visitor = [&node_count](const auto& self, const PageNode& n) -> void {
    ++node_count;
    n.visit(overloaded{
        [](const PageNode_KindHeading&) {},
        [](const PageNode_KindParagraph&) {},
        [](const PageNode_KindButton&) {},
        [&self](const PageNode_KindSection& s) {
          for (const auto& c : s.children) {
            self(self, c);
          }
        },
    });
  };
  count_visitor(count_visitor, root_section);
  ASSERT_EQ(node_count, 5);  // root section + heading + paragraph + subsection + button

  // 5. Error handling
  auto err_not_obj = typeprompt_02::ParseJson<PageNode>("\"not an object\"");
  ASSERT_FALSE(err_not_obj.ok());
  ASSERT_EQ(err_not_obj.error().message, "Expected object at json");

  auto err_missing_kind = typeprompt_02::ParseJson<PageNode>("{\"text\": \"hello\"}");
  ASSERT_FALSE(err_missing_kind.ok());
  ASSERT_EQ(err_missing_kind.error().message, "Missing key: kind at json");

  auto err_unknown_kind =
      typeprompt_02::ParseJson<PageNode>("{\"kind\": \"image\", \"url\": \"foo.png\"}");
  ASSERT_FALSE(err_unknown_kind.ok());
  ASSERT_EQ(err_unknown_kind.error().message, "Unknown discriminant 'image' at json");

  auto err_nested_field = typeprompt_02::ParseJson<PageNode>(
      "{\"kind\": \"heading\", \"level\": \"h1\", \"text\": 123}");
  ASSERT_FALSE(err_nested_field.ok());
  ASSERT_EQ(err_nested_field.error().message, "Expected string at json.text");

  auto err_recursive_nested = typeprompt_02::ParseJson<PageNode>(
      "{\"kind\": \"section\", \"title\": \"sec\", \"children\": ["
      "{\"kind\": \"button\", \"label\": 456, \"url\": \"https://example.com\"}"
      "]}");
  ASSERT_FALSE(err_recursive_nested.ok());
  ASSERT_EQ(err_recursive_nested.error().message, "Expected string at json.children[0].label");
}

void TestUserDefinedDiscriminatedUnionEnumWithCommonFields() {
  using namespace typeprompt_e01::schema::shared;

  // 1. Default constructor initializes to NotSuccess variant
  EnumWithCommonFields def_val;
  ASSERT_FALSE(def_val.success());
  ASSERT_EQ(def_val.as_not_success().x, 0);
  ASSERT_EQ(def_val.as_not_success().y, 0.0);
  ASSERT_EQ(def_val.as_not_success().z, "");

  // 2. Construction of NotSuccess variant via .whole builder
  EnumWithCommonFields_NotSuccess ns_payload = *EnumWithCommonFields_NotSuccess::whole{
      .x = 10,
      .y = 20.5,
      .z = std::string("failed-state"),
  };
  EnumWithCommonFields not_success = EnumWithCommonFields::variant_type(
      typeprompt_e01::indirect<EnumWithCommonFields_NotSuccess>(ns_payload));
  ASSERT_FALSE(not_success.success());
  ASSERT_EQ(not_success.as_not_success().x, 10);
  ASSERT_EQ(not_success.as_not_success().y, 20.5);
  ASSERT_EQ(not_success.as_not_success().z, "failed-state");

  // 3. Construction of Success variant via .whole builder
  EnumWithCommonFields_Success s_payload = *EnumWithCommonFields_Success::whole{
      .x = 42,
      .y = 3.14,
      .z = 100,
  };
  EnumWithCommonFields success = EnumWithCommonFields::variant_type(
      typeprompt_e01::indirect<EnumWithCommonFields_Success>(s_payload));
  ASSERT_TRUE(success.success());
  ASSERT_EQ(success.as_success().x, 42);
  ASSERT_EQ(success.as_success().y, 3.14);
  ASSERT_EQ(success.as_success().z, 100);

  // 4. Visiting both variants
  std::string visited_ns;
  not_success.visit(overloaded{
      [&visited_ns](const EnumWithCommonFields_NotSuccess& ns) {
        visited_ns = "not_success:" + ns.z;
      },
      [&visited_ns](const EnumWithCommonFields_Success& s) {
        visited_ns = "success:" + std::to_string(s.z);
      },
  });
  ASSERT_EQ(visited_ns, "not_success:failed-state");

  std::string visited_s;
  success.visit(overloaded{
      [&visited_s](const EnumWithCommonFields_NotSuccess& ns) {
        visited_s = "not_success:" + ns.z;
      },
      [&visited_s](const EnumWithCommonFields_Success& s) {
        visited_s = "success:" + std::to_string(s.z);
      },
  });
  ASSERT_EQ(visited_s, "success:100");

  // 5. Serialization and Deserialization Roundtrip for NotSuccess
  typeprompt_e01::JsonNode ns_node = ToJsonNode(not_success);
  auto parsed_ns = typeprompt_e01::Parse<EnumWithCommonFields>(ns_node);
  ASSERT_TRUE(parsed_ns.ok());
  ASSERT_FALSE(parsed_ns->success());
  ASSERT_EQ(parsed_ns->as_not_success().x, 10);
  ASSERT_EQ(parsed_ns->as_not_success().y, 20.5);
  ASSERT_EQ(parsed_ns->as_not_success().z, "failed-state");

  // Top-level serialization formats for NotSuccess
  ASSERT_EQ(typeprompt_e01::ToJson(not_success),
            "{\"success\": false,\"x\": 10,\"y\": 20.5,\"z\": \"failed-state\"}");
  ASSERT_EQ(typeprompt_e01::ToYaml(not_success),
            "success: false\n"
            "x: 10\n"
            "\"y\": 20.5\n"
            "z: failed-state");
  ASSERT_EQ(typeprompt_e01::ToToon(not_success),
            "success: false\n"
            "x: 10\n"
            "y: 20.5\n"
            "z: failed-state");

  // 6. Serialization and Deserialization Roundtrip for Success
  typeprompt_e01::JsonNode s_node = ToJsonNode(success);
  auto parsed_s = typeprompt_e01::Parse<EnumWithCommonFields>(s_node);
  ASSERT_TRUE(parsed_s.ok());
  ASSERT_TRUE(parsed_s->success());
  ASSERT_EQ(parsed_s->as_success().x, 42);
  ASSERT_EQ(parsed_s->as_success().y, 3.14);
  ASSERT_EQ(parsed_s->as_success().z, 100);

  // Top-level serialization formats for Success
  ASSERT_EQ(typeprompt_e01::ToJson(success),
            "{\"success\": true,\"x\": 42,\"y\": 3.14,\"z\": 100}");
  ASSERT_EQ(typeprompt_e01::ToYaml(success),
            "success: true\n"
            "x: 42\n"
            "\"y\": 3.14\n"
            "z: 100");
  ASSERT_EQ(typeprompt_e01::ToToon(success),
            "success: true\n"
            "x: 42\n"
            "y: 3.14\n"
            "z: 100");

  // 7. ParseJson direct parsing
  auto direct_ns = typeprompt_e01::ParseJson<EnumWithCommonFields>(
      "{\"success\": false, \"x\": 1, \"y\": 2.0, \"z\": \"err\"}");
  ASSERT_TRUE(direct_ns.ok());
  ASSERT_FALSE(direct_ns->success());
  ASSERT_EQ(direct_ns->as_not_success().x, 1);
  ASSERT_EQ(direct_ns->as_not_success().y, 2.0);
  ASSERT_EQ(direct_ns->as_not_success().z, "err");

  auto direct_s = typeprompt_e01::ParseJson<EnumWithCommonFields>(
      "{\"success\": true, \"x\": 7, \"y\": 8.5, \"z\": 99}");
  ASSERT_TRUE(direct_s.ok());
  ASSERT_TRUE(direct_s->success());
  ASSERT_EQ(direct_s->as_success().x, 7);
  ASSERT_EQ(direct_s->as_success().y, 8.5);
  ASSERT_EQ(direct_s->as_success().z, 99);

  // 8. Error reporting with boolean discriminant and JsonPath context
  auto err_not_obj = typeprompt_e01::ParseJson<EnumWithCommonFields>("\"not_an_obj\"");
  ASSERT_FALSE(err_not_obj.ok());
  ASSERT_EQ(err_not_obj.error().message, "Expected object at json");

  auto err_missing_discriminant =
      typeprompt_e01::ParseJson<EnumWithCommonFields>("{\"x\": 1, \"y\": 2.0, \"z\": \"err\"}");
  ASSERT_FALSE(err_missing_discriminant.ok());
  ASSERT_EQ(err_missing_discriminant.error().message, "Missing key: success at json");

  auto err_discriminant_string = typeprompt_e01::ParseJson<EnumWithCommonFields>(
      "{\"success\": \"true\", \"x\": 1, \"y\": 2.0, \"z\": 99}");
  ASSERT_FALSE(err_discriminant_string.ok());
  ASSERT_EQ(err_discriminant_string.error().message, "Expected boolean at json.success");

  auto err_discriminant_number = typeprompt_e01::ParseJson<EnumWithCommonFields>(
      "{\"success\": 1, \"x\": 1, \"y\": 2.0, \"z\": 99}");
  ASSERT_FALSE(err_discriminant_number.ok());
  ASSERT_EQ(err_discriminant_number.error().message, "Expected boolean at json.success");

  auto err_discriminant_null = typeprompt_e01::ParseJson<EnumWithCommonFields>(
      "{\"success\": null, \"x\": 1, \"y\": 2.0, \"z\": 99}");
  ASSERT_FALSE(err_discriminant_null.ok());
  ASSERT_EQ(err_discriminant_null.error().message, "Expected boolean at json.success");

  auto err_ns_payload_type = typeprompt_e01::ParseJson<EnumWithCommonFields>(
      "{\"success\": false, \"x\": 1, \"y\": 2.0, \"z\": 123}");
  ASSERT_FALSE(err_ns_payload_type.ok());
  ASSERT_EQ(err_ns_payload_type.error().message, "Expected string at json.z");

  auto err_s_payload_type = typeprompt_e01::ParseJson<EnumWithCommonFields>(
      "{\"success\": true, \"x\": 1, \"y\": 2.0, \"z\": \"not_a_num\"}");
  ASSERT_FALSE(err_s_payload_type.ok());
  ASSERT_EQ(err_s_payload_type.error().message, "Expected number at json.z");

  auto err_payload_missing_field =
      typeprompt_e01::ParseJson<EnumWithCommonFields>("{\"success\": true, \"x\": 1, \"y\": 2.0}");
  ASSERT_FALSE(err_payload_missing_field.ok());
  ASSERT_EQ(err_payload_missing_field.error().message, "Missing key: z at json");
}

void TestRenderBasicsTranslate() {
  auto prompt = typeprompt_01::Render<typeprompt_01::templates::Translate>({
      .target_language = "French",
      .text = "Hello world",
  });

  ASSERT_TRUE(prompt.output_format == typeprompt_01::OutputFormat::kText);
  ASSERT_EQ(prompt.template_id, "Main:Translate");
  ASSERT_TRUE(prompt.system_message.find("professional translator") != std::string::npos);
  ASSERT_TRUE(prompt.user_message.find("French") != std::string::npos);
  ASSERT_TRUE(prompt.user_message.find("<Text>\nHello world\n</Text>") != std::string::npos);
  ASSERT_EQ(prompt.examples.size(), 2);
  ASSERT_TRUE(prompt.examples[0].response.find("La réunion") != std::string::npos);
  ASSERT_TRUE(prompt.examples[0].user_message.find("<Text>") != std::string::npos);
  ASSERT_EQ(prompt.tools.size(), 0);
}

void TestRenderComplexSchemas() {
  auto prompt = typeprompt_02::Render<typeprompt_02::templates::TriageTicket>({
      .body = "It crashes every time.",
      .customer_tier = typeprompt_02::schema::triage_ticket::Input_CustomerTier::kPro,
      .recent_tickets = {{}},
      .subject = "App crashes on login",
  });

  ASSERT_TRUE(prompt.output_format == typeprompt_02::OutputFormat::kJson);
  ASSERT_TRUE(prompt.output_json_schema.has_value());
  ASSERT_TRUE(prompt.meta.temperature.has_value());
  ASSERT_EQ(*prompt.meta.temperature, 0.2);
  ASSERT_TRUE(prompt.meta.model == typeprompt_02::schema::meta::Meta_Model::kGpt4o);

  auto parsed = typeprompt_02::ParseResponse<typeprompt_02::templates::TriageTicket>(
      "```json\n"
      "{\n"
      "  \"category\": \"technical-issue\",\n"
      "  \"urgency\": \"high\",\n"
      "  \"summary\": \"Application crashes when logging in\",\n"
      "  \"suggestedActions\": [\"escalate_to_tier_2\"]\n"
      "}\n"
      "```");
  ASSERT_TRUE(parsed.ok());
  ASSERT_TRUE(parsed->category ==
              typeprompt_02::schema::triage_ticket::TicketCategory::kTechnicalIssue);
  ASSERT_TRUE(parsed->urgency == typeprompt_02::schema::triage_ticket::Output_Urgency::kHigh);
  ASSERT_EQ(parsed->summary, "Application crashes when logging in");
  ASSERT_EQ(parsed->suggested_actions.size(), 1);
  ASSERT_EQ(parsed->suggested_actions[0], "escalate_to_tier_2");
}

void TestRenderTools() {
  auto prompt = typeprompt_03::Render<typeprompt_03::templates::ResearchQuestion>(
      typeprompt_03::schema::research_question::Input{
          .question = "What is quantum computing?",
      });

  ASSERT_EQ(prompt.tools.size(), 1);
  auto it = prompt.tools.find("webSearch");
  ASSERT_TRUE(it != prompt.tools.end());
  ASSERT_EQ(it->second.name, "webSearch");
  ASSERT_FALSE(it->second.description.empty());
  ASSERT_TRUE(it->second.input_json_schema.type() == typeprompt_03::JsonNode::Type::kObject);
}

void TestRenderVariants() {
  auto marketing = typeprompt_04::Render<typeprompt_04::templates::WriteProductDescription>({
      .product_name = "Acme Widget",
      .features = {{"Fast", "Reliable"}},
      .variant = typeprompt_04::schema::write_product_description::Input_Variant::kMarketing,
  });
  ASSERT_TRUE(marketing.system_message.find("marketing") != std::string::npos ||
              marketing.system_message.find("compelling") != std::string::npos ||
              marketing.user_message.find("Acme Widget") != std::string::npos);

  auto technical = typeprompt_04::Render<typeprompt_04::templates::WriteProductDescription>({
      .product_name = "Acme Widget",
      .features = {{"Fast", "Reliable"}},
      .variant = typeprompt_04::schema::write_product_description::Input_Variant::kTechnical,
  });
  ASSERT_TRUE(technical.user_message.find("Acme Widget") != std::string::npos);
}

void TestRenderConditionalLogic() {
  auto p_exec = typeprompt_05::Render<typeprompt_05::templates::SummarizeDocument>({
      .title = "Quarterly Report",
      .content = "Quarterly results are strong.",
      .focus_topic = "revenue",
      .audience = typeprompt_05::schema::summarize_document::Input_Audience::kExecutive,
  });
  ASSERT_TRUE(p_exec.system_message.find("executive") != std::string::npos);
  ASSERT_TRUE(p_exec.system_message.find("revenue") != std::string::npos);

  auto p_tech = typeprompt_05::Render<typeprompt_05::templates::SummarizeDocument>({
      .title = "Tech Specs",
      .content = "Architecture RFC...",
      .focus_topic = std::nullopt,
      .audience = typeprompt_05::schema::summarize_document::Input_Audience::kTechnical,
  });
  ASSERT_TRUE(p_tech.system_message.find("technical") != std::string::npos);
  ASSERT_TRUE(p_tech.system_message.find("revenue") == std::string::npos);
}

void TestRenderTabularFormatting() {
  auto prompt_csv = typeprompt_e01::Render<typeprompt_e01::templates::AnalyzeSalesData>({
      .rows = {{
          {
              .product = "Widget A",
              .units = 100,
              .revenue_cents = 199900,
              .region = "EMEA",
          },
          {
              .product = "Widget, B",
              .units = 50,
              .revenue_cents = 75000,
              .region = "APAC",
          },
      }},
      .question = "Total sales?",
      .variant = typeprompt_e01::schema::analyze_sales_data::Input_Variant::kCsv,
  });
  ASSERT_TRUE(prompt_csv.user_message.find("product,units,revenueCents,region") !=
              std::string::npos);
  ASSERT_TRUE(prompt_csv.user_message.find("\"Widget, B\"") != std::string::npos);
}

void TestTemplateOverrider() {
  // 1. templatesData() returns valid JSON with signature
  auto data = typeprompt_01::TemplateOverrider::templatesData();
  ASSERT_TRUE(data.type() == typeprompt_01::JsonNode::Type::kObject);
  std::string sig;
  for (const auto& [k, v] : data.as_object()) {
    if (k == "signature" && v.type() == typeprompt_01::JsonNode::Type::kString) {
      sig = v.as_string();
    }
  }
  ASSERT_FALSE(sig.empty());

  // 2. Signature mismatch returns error
  typeprompt_01::JsonNode wrong_doc(typeprompt_01::JsonNode::Object{
      {"signature", typeprompt_01::JsonNode("wrong_sig")},
      {"singleNamespace", typeprompt_01::JsonNode(true)},
      {"edition", typeprompt_01::JsonNode(0)},
      {"templates", typeprompt_01::JsonNode(typeprompt_01::JsonNode::Object{})},
      {"tools", typeprompt_01::JsonNode(typeprompt_01::JsonNode::Object{})},
      {"sourceFiles", typeprompt_01::JsonNode(typeprompt_01::JsonNode::Object{})},
  });
  auto mismatch_res = typeprompt_01::TemplateOverrider::applyOverrides(wrong_doc);
  ASSERT_FALSE(mismatch_res.ok());
  ASSERT_EQ(mismatch_res.error().message, "Signature mismatch");

  // 3. Non-object returns error
  auto non_obj_res =
      typeprompt_01::TemplateOverrider::applyOverrides(typeprompt_01::JsonNode("not an object"));
  ASSERT_FALSE(non_obj_res.ok());
  ASSERT_EQ(non_obj_res.error().message, "Expected object at json");

  // 4. Valid overrides return Templates (move-only) and work with Render
  auto overridden_res = typeprompt_01::TemplateOverrider::applyOverrides(data);
  ASSERT_TRUE(overridden_res.ok());
  auto moved_data = std::move(*overridden_res);
  auto prompt = typeprompt_01::Render<typeprompt_01::templates::Translate>(
      {
          .target_language = "Spanish",
          .text = "Good morning",
      },
      moved_data);
  ASSERT_TRUE(prompt.user_message.find("Spanish") != std::string::npos);
  ASSERT_TRUE(prompt.user_message.find("Good morning") != std::string::npos);
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

  TestToPrettyJsonNull();
  TestToPrettyJsonBool();
  TestToPrettyJsonNumber();
  TestToPrettyJsonString();
  TestToPrettyJsonArray();
  TestToPrettyJsonObject();
  TestToPrettyJsonNestedComplex();

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
  TestTopLevelSerializers();
  TestParseValueOverloads();
  TestParseSingleArgOverloads();
  TestStructParser();
  TestJsonPathErrorFormatting();
  TestUnions();
  TestIndirect();
  TestMustInit();
  TestPageNodeVisit();
  TestUserDefinedEnums();
  TestUserDefinedStructs();
  TestUserDefinedDiscriminatedUnionPageNode();
  TestUserDefinedDiscriminatedUnionEnumWithCommonFields();

  TestRenderBasicsTranslate();
  TestRenderComplexSchemas();
  TestRenderTools();
  TestRenderVariants();
  TestRenderConditionalLogic();
  TestRenderTabularFormatting();
  TestTemplateOverrider();
}

int main() {
  std::cout << "Running C++ runtime logic tests...\n";
  TestRuntimeLogic();
  std::cout << "All C++ tests passed.\n";
  return 0;
}
