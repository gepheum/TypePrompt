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
}

int main() {
  std::cout << "Running C++ runtime logic tests...\n";
  TestRuntimeLogic();
  std::cout << "All C++ tests passed.\n";
  return 0;
}
