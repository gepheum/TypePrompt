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

void TestStringifyToonPrimitives() {
  JsonNode default_null;
  ASSERT_EQ(default_null.StringifyToon(), "null");

  JsonNode explicit_null(std::nullopt);
  ASSERT_EQ(explicit_null.StringifyToon(), "null");

  JsonNode bool_true(true);
  ASSERT_EQ(bool_true.StringifyToon(), "true");

  JsonNode bool_false(false);
  ASSERT_EQ(bool_false.StringifyToon(), "false");

  JsonNode str_plain(std::string("hello world"));
  ASSERT_EQ(str_plain.StringifyToon(), "hello world");

  JsonNode str_with_colon(std::string("hello: world"));
  ASSERT_EQ(str_with_colon.StringifyToon(), "\"hello: world\"");
}

void TestStringifyToonNumbers() {
  JsonNode num_zero(0.0);
  ASSERT_EQ(num_zero.StringifyToon(), "0");

  JsonNode num_neg_zero(-0.0);
  ASSERT_EQ(num_neg_zero.StringifyToon(), "0");

  JsonNode num_int(1.0);
  ASSERT_EQ(num_int.StringifyToon(), "1");

  JsonNode num_pos(42.5);
  ASSERT_EQ(num_pos.StringifyToon(), "42.5");

  JsonNode num_neg(-17.25);
  ASSERT_EQ(num_neg.StringifyToon(), "-17.25");

  JsonNode num_million(1000000.0);
  ASSERT_EQ(num_million.StringifyToon(), "1000000");

  JsonNode num_micro(0.000001);
  ASSERT_EQ(num_micro.StringifyToon(), "0.000001");

  JsonNode num_nan(std::numeric_limits<double>::quiet_NaN());
  ASSERT_EQ(num_nan.StringifyToon(), "null");

  JsonNode num_pos_inf(std::numeric_limits<double>::infinity());
  ASSERT_EQ(num_pos_inf.StringifyToon(), "null");

  JsonNode num_neg_inf(-std::numeric_limits<double>::infinity());
  ASSERT_EQ(num_neg_inf.StringifyToon(), "null");
}

void TestStringifyToonStringsAndEscapes() {
  JsonNode empty_str(std::string(""));
  ASSERT_EQ(empty_str.StringifyToon(), "\"\"");

  JsonNode lead_space(std::string(" leading"));
  ASSERT_EQ(lead_space.StringifyToon(), "\" leading\"");

  JsonNode trail_space(std::string("trailing "));
  ASSERT_EQ(trail_space.StringifyToon(), "\"trailing \"");

  JsonNode lead_tab(std::string("\tleading tab"));
  ASSERT_EQ(lead_tab.StringifyToon(), "\"\\tleading tab\"");

  JsonNode kw_true(std::string("true"));
  ASSERT_EQ(kw_true.StringifyToon(), "\"true\"");

  JsonNode kw_false(std::string("false"));
  ASSERT_EQ(kw_false.StringifyToon(), "\"false\"");

  JsonNode kw_null(std::string("null"));
  ASSERT_EQ(kw_null.StringifyToon(), "\"null\"");

  JsonNode num_str_42(std::string("42"));
  ASSERT_EQ(num_str_42.StringifyToon(), "\"42\"");

  JsonNode num_str_neg(std::string("-3.14"));
  ASSERT_EQ(num_str_neg.StringifyToon(), "\"-3.14\"");

  JsonNode num_str_lead_zero(std::string("05"));
  ASSERT_EQ(num_str_lead_zero.StringifyToon(), "\"05\"");

  JsonNode num_str_plus(std::string("+1"));
  ASSERT_EQ(num_str_plus.StringifyToon(), "\"+1\"");

  JsonNode num_str_exp(std::string("1e-6"));
  ASSERT_EQ(num_str_exp.StringifyToon(), "\"1e-6\"");

  JsonNode str_dot5(std::string(".5"));
  ASSERT_EQ(str_dot5.StringifyToon(), ".5");

  JsonNode str_1dot(std::string("1."));
  ASSERT_EQ(str_1dot.StringifyToon(), "1.");

  JsonNode quotes_and_bs(std::string("quote: \", backslash: \\"));
  ASSERT_EQ(quotes_and_bs.StringifyToon(), "\"quote: \\\", backslash: \\\\\"");

  JsonNode escapes(std::string("line1\nline2\ttab\rcarriage"));
  ASSERT_EQ(escapes.StringifyToon(), "\"line1\\nline2\\ttab\\rcarriage\"");

  JsonNode bs_ctrl(std::string("\b", 1));
  ASSERT_EQ(bs_ctrl.StringifyToon(), "\"\\u0008\"");

  JsonNode ff_ctrl(std::string("\f", 1));
  ASSERT_EQ(ff_ctrl.StringifyToon(), "\"\\u000c\"");

  JsonNode hex_ctrl(std::string("\x01\x1f", 2));
  ASSERT_EQ(hex_ctrl.StringifyToon(), "\"\\u0001\\u001f\"");

  std::string with_null("null\0byte", 9);
  JsonNode null_char_str(with_null);
  ASSERT_EQ(null_char_str.StringifyToon(), "\"null\\u0000byte\"");

  JsonNode unicode_plain(std::string("Hello 世界! 🌍"));
  ASSERT_EQ(unicode_plain.StringifyToon(), "Hello 世界! 🌍");

  JsonNode unicode_with_comma(std::string("Hello, 世界! 🌍"));
  ASSERT_EQ(unicode_with_comma.StringifyToon(), "\"Hello, 世界! 🌍\"");

  JsonNode lead_hyphen(std::string("-foo"));
  ASSERT_EQ(lead_hyphen.StringifyToon(), "\"-foo\"");

  JsonNode bare_hyphen(std::string("-"));
  ASSERT_EQ(bare_hyphen.StringifyToon(), "\"-\"");

  JsonNode lead_hash(std::string("#comment"));
  ASSERT_EQ(lead_hash.StringifyToon(), "\"#comment\"");

  JsonNode bare_hash(std::string("#"));
  ASSERT_EQ(bare_hash.StringifyToon(), "\"#\"");

  JsonNode comma_str(std::string("a,b"));
  ASSERT_EQ(comma_str.StringifyToon(), "\"a,b\"");
}

void TestStringifyToonKeys() {
  JsonNode safe_keys(std::vector<std::pair<std::string, JsonNode>>{
      {"id", JsonNode(1.0)},
      {"user_name", JsonNode(std::string("Ada"))},
      {"user.name", JsonNode(std::string("Ada"))},
  });
  ASSERT_EQ(safe_keys.StringifyToon(),
            "id: 1\n"
            "user_name: Ada\n"
            "user.name: Ada");

  JsonNode quoted_keys(std::vector<std::pair<std::string, JsonNode>>{
      {"my-key", JsonNode(1.0)},
      {"123", JsonNode(2.0)},
      {"key:with:colon", JsonNode(3.0)},
      {"key with spaces", JsonNode(4.0)},
  });
  ASSERT_EQ(quoted_keys.StringifyToon(),
            "\"my-key\": 1\n"
            "\"123\": 2\n"
            "\"key:with:colon\": 3\n"
            "\"key with spaces\": 4");
}

void TestStringifyToonEmptyStructures() {
  JsonNode empty_obj(std::vector<std::pair<std::string, JsonNode>>{});
  ASSERT_EQ(empty_obj.StringifyToon(), "");

  JsonNode obj_with_empty(std::vector<std::pair<std::string, JsonNode>>{
      {"empty", JsonNode(std::vector<std::pair<std::string, JsonNode>>{})},
  });
  ASSERT_EQ(obj_with_empty.StringifyToon(), "empty:");

  JsonNode empty_arr(std::vector<JsonNode>{});
  ASSERT_EQ(empty_arr.StringifyToon(), "[]");

  JsonNode obj_with_empty_arr(std::vector<std::pair<std::string, JsonNode>>{
      {"items", JsonNode(std::vector<JsonNode>{})},
  });
  ASSERT_EQ(obj_with_empty_arr.StringifyToon(), "items: []");

  JsonNode arr_of_empty_objs(std::vector<JsonNode>{
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{}),
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{}),
  });
  ASSERT_EQ(arr_of_empty_objs.StringifyToon(),
            "[2]:\n"
            "  -\n"
            "  -");
}

void TestStringifyToonPrimitiveArrays() {
  JsonNode root_arr(std::vector<JsonNode>{
      JsonNode(1.0),
      JsonNode(2.0),
      JsonNode(3.0),
  });
  ASSERT_EQ(root_arr.StringifyToon(), "[3]: 1,2,3");

  JsonNode field_arr(std::vector<std::pair<std::string, JsonNode>>{
      {"tags", JsonNode(std::vector<JsonNode>{
                   JsonNode(std::string("admin")),
                   JsonNode(std::string("ops")),
                   JsonNode(std::string("dev")),
               })},
  });
  ASSERT_EQ(field_arr.StringifyToon(), "tags[3]: admin,ops,dev");

  JsonNode arr_with_commas(std::vector<JsonNode>{
      JsonNode(std::string("admin,ops")),
      JsonNode(std::string("dev")),
  });
  ASSERT_EQ(arr_with_commas.StringifyToon(), "[2]: \"admin,ops\",dev");
}

void TestStringifyToonArraysOfArrays() {
  JsonNode pairs(std::vector<std::pair<std::string, JsonNode>>{
      {"pairs", JsonNode(std::vector<JsonNode>{
                    JsonNode(std::vector<JsonNode>{JsonNode(1.0), JsonNode(2.0)}),
                    JsonNode(std::vector<JsonNode>{JsonNode(3.0), JsonNode(4.0)}),
                })},
  });
  ASSERT_EQ(pairs.StringifyToon(),
            "pairs[2]:\n"
            "  - [2]: 1,2\n"
            "  - [2]: 3,4");

  JsonNode with_empty_inner(std::vector<JsonNode>{
      JsonNode(std::vector<JsonNode>{JsonNode(1.0), JsonNode(2.0)}),
      JsonNode(std::vector<JsonNode>{}),
  });
  ASSERT_EQ(with_empty_inner.StringifyToon(),
            "[2]:\n"
            "  - [2]: 1,2\n"
            "  - [0]:");
}

void TestStringifyToonTabularArrays() {
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
  ASSERT_EQ(items.StringifyToon(),
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
  ASSERT_EQ(root_tabular.StringifyToon(),
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
  ASSERT_EQ(reordered.StringifyToon(),
            "[2]{a,b}:\n"
            "  1,2\n"
            "  3,4");
}

void TestStringifyToonTabularNestedFieldGroups() {
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
  ASSERT_EQ(orders.StringifyToon(),
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
  ASSERT_EQ(multi_nested.StringifyToon(),
            "[1]{id,loc{geo{lat,lng}}}:\n"
            "  1,10,20");
}

void TestStringifyToonKeyedTabular() {
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
  ASSERT_EQ(root_keyed.StringifyToon(),
            "[2:]{age,city}:\n"
            "  alice: 30,Berlin\n"
            "  bob: 25,Oslo");

  JsonNode field_keyed(std::vector<std::pair<std::string, JsonNode>>{
      {"users", root_keyed},
  });
  ASSERT_EQ(field_keyed.StringifyToon(),
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
  ASSERT_EQ(single_entry.StringifyToon(),
            "users:\n"
            "  alice:\n"
            "    age: 30\n"
            "    city: Berlin");
}

void TestStringifyToonListForm() {
  JsonNode mixed(std::vector<JsonNode>{
      JsonNode(1.0),
      JsonNode(std::vector<std::pair<std::string, JsonNode>>{{"a", JsonNode(1.0)}}),
      JsonNode(std::string("text")),
  });
  ASSERT_EQ(mixed.StringifyToon(),
            "[3]:\n"
            "  - 1\n"
            "  - a: 1\n"
            "  - text");
}

void TestStringifyToonObjectsAsListItems() {
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
  ASSERT_EQ(list_objs.StringifyToon(),
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
  ASSERT_EQ(list_with_nested_obj.StringifyToon(),
            "[2]:\n"
            "  - address:\n"
            "      city: Paris\n"
            "    country: FR\n"
            "  - name: Alice");
}

void TestStringifyToonObjectsAsListItemsWithTabular() {
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
  ASSERT_EQ(items.StringifyToon(),
            "items[1]:\n"
            "  - users[2]{id,name}:\n"
            "      1,Ada\n"
            "      2,Bob\n"
            "    status: active");
}

void TestStringifyToonGeneralObjects() {
  JsonNode obj(std::vector<std::pair<std::string, JsonNode>>{
      {"id", JsonNode(123.0)},
      {"name", JsonNode(std::string("Ada"))},
      {"active", JsonNode(true)},
  });
  ASSERT_EQ(obj.StringifyToon(),
            "id: 123\n"
            "name: Ada\n"
            "active: true");

  JsonNode nested(std::vector<std::pair<std::string, JsonNode>>{
      {"user", JsonNode(std::vector<std::pair<std::string, JsonNode>>{
                   {"id", JsonNode(123.0)},
                   {"name", JsonNode(std::string("Ada"))},
               })},
  });
  ASSERT_EQ(nested.StringifyToon(),
            "user:\n"
            "  id: 123\n"
            "  name: Ada");
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

  TestStringifyToonPrimitives();
  TestStringifyToonNumbers();
  TestStringifyToonStringsAndEscapes();
  TestStringifyToonKeys();
  TestStringifyToonEmptyStructures();
  TestStringifyToonPrimitiveArrays();
  TestStringifyToonArraysOfArrays();
  TestStringifyToonTabularArrays();
  TestStringifyToonTabularNestedFieldGroups();
  TestStringifyToonKeyedTabular();
  TestStringifyToonListForm();
  TestStringifyToonObjectsAsListItems();
  TestStringifyToonObjectsAsListItemsWithTabular();
  TestStringifyToonGeneralObjects();
}

int main() {
  std::cout << "Running C++ runtime logic tests...\n";
  TestRuntimeLogic();
  std::cout << "All C++ tests passed.\n";
  return 0;
}
