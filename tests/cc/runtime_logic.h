#pragma once

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstddef>
#include <cstdio>
#include <cstdlib>
#include <limits>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <type_traits>
#include <utility>
#include <variant>
#include <vector>

namespace typeprompt {

struct ParseError {
  std::string message;
  size_t pos = 0;
};

template <typename T>
using ParseResult = std::variant<T, ParseError>;

// A composable JSON value. Can be formatted to JSON, YAML or TOON format.
class JsonNode {
 public:
  enum class Type {
    kNull,
    kBool,
    kNumber,
    kString,
    kArray,
    kObject,
  };

  JsonNode() : data_(std::nullopt) {}
  explicit JsonNode(std::nullopt_t value) : data_(value) {}
  explicit JsonNode(bool value) : data_(value) {}
  explicit JsonNode(double value) : data_(value) {}
  explicit JsonNode(std::string_view value) : data_(NormalizeUtf8(value)) {}
  explicit JsonNode(std::vector<JsonNode> value) : data_(std::move(value)) {}
  explicit JsonNode(std::vector<std::pair<std::string, JsonNode>> value)
      : data_(std::move(value)) {}

  JsonNode(const JsonNode&) = default;
  JsonNode(JsonNode&&) = default;

  JsonNode& operator=(const JsonNode&) = default;
  JsonNode& operator=(JsonNode&&) = default;

  static ParseResult<JsonNode> ParseJson(std::string_view json);

  Type type() const {
    return std::visit(
        [](const auto& value) -> Type {
          using T = std::decay_t<decltype(value)>;
          if constexpr (std::is_same_v<T, std::nullopt_t>) {
            return Type::kNull;
          } else if constexpr (std::is_same_v<T, bool>) {
            return Type::kBool;
          } else if constexpr (std::is_same_v<T, double>) {
            return Type::kNumber;
          } else if constexpr (std::is_same_v<T, std::string>) {
            return Type::kString;
          } else if constexpr (std::is_same_v<T, JsonArrayVariant>) {
            return Type::kArray;
          } else if constexpr (std::is_same_v<T, JsonObjectVariant>) {
            return Type::kObject;
          }
        },
        data_);
  }

  bool AsBool() const { return std::get<bool>(data_); }
  double AsNumber() const { return std::get<double>(data_); }

  const std::string& AsString() const& { return std::get<std::string>(data_); }
  std::string AsString() && { return std::get<std::string>(std::move(data_)); }

  const std::vector<JsonNode>& AsArray() const& { return std::get<JsonArrayVariant>(data_); }
  std::vector<JsonNode> AsArray() && { return std::get<JsonArrayVariant>(std::move(data_)); }

  const std::vector<std::pair<std::string, JsonNode>>& AsObject() const& {
    return std::get<JsonObjectVariant>(data_);
  }
  std::vector<std::pair<std::string, JsonNode>> AsObject() && {
    return std::get<JsonObjectVariant>(std::move(data_));
  }

  std::string ToJson() const {
    std::string json;
    std::string eolIndent;
    AppendJson(json, eolIndent);
    return json;
  }

  std::string ToJsonWithIndent() const {
    std::string json;
    std::string eolIndent = "\n";
    AppendJson(json, eolIndent);
    return json;
  }

  inline std::string ToToon() const;
  inline std::string ToYaml() const;

 private:
  using JsonArrayVariant = std::vector<JsonNode>;
  using JsonObjectVariant = std::vector<std::pair<std::string, JsonNode>>;

  std::variant<std::nullopt_t, bool, double, std::string, JsonArrayVariant, JsonObjectVariant>
      data_;

  static std::string NormalizeUtf8(std::string_view input) {
    std::string out;
    out.reserve(input.size());
    const char* input_pos = input.data();
    const char* input_end = input_pos + input.size();
    while (input_pos < input_end) {
      const uint8_t byte = static_cast<uint8_t>(*(input_pos++));
      if (byte < 0x80) {
        out += static_cast<char>(byte);
      } else {
        CopyUtf8Codepoint(byte, input_pos, input_end, out);
      }
    }
    return out;
  }

  static void CopyUtf8Codepoint(uint8_t first_byte, const char*& pos, const char* end,
                                std::string& out) {
    // Push byte and all the continuation bytes that follow. If the input
    // string happens to not be a well-formed UTF-8 string, we'll remove the
    // chars we have pushed.
    out += static_cast<char>(first_byte);

    // Total number of continuation bytes actually read.
    size_t continuation_bytes = 0;

    // From https://github.com/chansen/c-utf8-valid/blob/master/utf8_valid.h
    uint32_t v = first_byte;

    while (pos < end) {
      const uint8_t continuation_byte = static_cast<uint8_t>(*pos);
      if ((continuation_byte & 0xC0) == 0x80) {
        out += static_cast<char>(continuation_byte);
        ++continuation_bytes;
        v = (v << 8) | continuation_byte;
        ++pos;
      } else {
        // Not a continuation byte.
        break;
      }
    }

    // Validate the UTF-8 sequence we just read.
    if ((first_byte & 0xE0) == 0xC0) {
      // 1 continuation byte expected
      if (continuation_bytes != 1) goto utf8_error;
      // Ensure that the top 4 bits is not zero
      v = v & 0x1E00;
      if (v == 0) goto utf8_error;
    } else if ((first_byte & 0xF0) == 0xE0) {
      // 2 continuation bytes expected
      if (continuation_bytes != 2) goto utf8_error;
      // Ensure that the top 5 bits is not zero and not a surrogate
      v = v & 0x0F2000;
      if (v == 0 || v == 0x0D2000) goto utf8_error;
    } else if ((first_byte & 0xF8) == 0xF0) {
      // 3 continuation bytes expected
      if (continuation_bytes != 3) goto utf8_error;
      // Ensure that the top 5 bits is not zero and not out of range
      v = v & 0x07300000;
      if (v == 0 || v > 0x04000000) goto utf8_error;
    } else {
      goto utf8_error;
    }

    return;

  utf8_error:
    // Remove the last (continuation_bytes + 1) chars from the output.
    out.resize(out.size() - continuation_bytes - 1);
    // Push the replacement character: \uFFFD (\xEF\xBF\xBD in UTF-8)
    out += "\xEF\xBF\xBD";
  }

  // ─── JSON Formatting Logic ──────────────────────────────────────────────────

  void AppendJson(std::string& out, std::string& eolIndent) const {
    switch (type()) {
      case Type::kNull: {
        out += "null";
        break;
      }
      case Type::kBool: {
        out += AsBool() ? "true" : "false";
        break;
      }
      case Type::kNumber: {
        double number = AsNumber();
        if (!std::isfinite(number)) {
          if (std::isnan(number)) {
            number = 0.0;
          } else if (number < 0) {
            number = std::numeric_limits<double>::min();
          } else {
            number = std::numeric_limits<double>::max();
          }
        }
        out += std::to_string(number);
        break;
      }
      case Type::kString: {
        AppendJsonString(AsString(), out);
        break;
      }
      case Type::kArray: {
        const std::vector<JsonNode>& array = AsArray();
        if (array.empty()) {
          out += "[]";
        } else if (eolIndent.empty()) {
          out += "[";
          for (size_t i = 0; i < array.size(); ++i) {
            if (i != 0) {
              out += ',';
            }
            array[i].AppendJson(out, eolIndent);
          }
          out += "]";
        } else {
          eolIndent += "  ";
          out += "[";
          for (size_t i = 0; i < array.size(); ++i) {
            if (i != 0) {
              out += ',';
            }
            out += eolIndent;
            array[i].AppendJson(out, eolIndent);
          }
          eolIndent.resize(eolIndent.size() - 2);
          out += eolIndent;
          out += "]";
        }
        break;
      }
      case Type::kObject: {
        const auto& object = AsObject();
        if (object.empty()) {
          out += "{}";
        } else if (eolIndent.empty()) {
          out += "{";
          for (size_t i = 0; i < object.size(); ++i) {
            if (i != 0) {
              out += ',';
            }
            const auto& [name, value] = object[i];
            AppendJsonString(name, out);
            out += ": ";
            value.AppendJson(out, eolIndent);
          }
          out += "}";
        } else {
          out += "{";
          eolIndent += "  ";
          for (size_t i = 0; i < object.size(); ++i) {
            if (i != 0) {
              out += ',';
            }
            out += eolIndent;
            const auto& [name, value] = object[i];
            AppendJsonString(name, out);
            out += ": ";
            value.AppendJson(out, eolIndent);
          }
          eolIndent.resize(eolIndent.size() - 2);
          out += eolIndent;
          out += "}";
        }
        break;
      }
    }
  }

  static void AppendJsonString(const std::string& value, std::string& out) {
    static constexpr char kHexDigits[] = "0123456789ABCDEF";
    out += '"';
    const char* pos = value.data();
    const char* const end = pos + value.size();
    while (true) {
      const uint8_t byte = static_cast<uint8_t>(*pos++);
      if (byte < 0x20) {
        // A non-printable character.
        switch (byte) {
          case '\0': {
            // \0 may indicate the end of the string, but it can also be part of
            // the string's contents.
            if (pos > end) {
              // The end of the input string was reached.
              out += '"';
              return;
            } else {
              out += {'\\', 'u', '0', '0', '0', '0'};
              break;
            }
          }
          case '\b': {
            out += {'\\', 'b'};
            break;
          }
          case '\f': {
            out += {'\\', 'f'};
            break;
          }
          case '\n': {
            out += {'\\', 'n'};
            break;
          }
          case '\r': {
            out += {'\\', 'r'};
            break;
          }
          case '\t': {
            out += {'\\', 't'};
            break;
          }
          default: {
            out += {'\\', 'u', '0', '0', kHexDigits[(byte >> 4) & 0x0F], kHexDigits[byte & 0x0F]};
          }
        }
      } else {
        // A printable character.
        switch (byte) {
          case '"': {
            out += {'\\', '"'};
            break;
          }
          case '\\': {
            out += {'\\', '\\'};
            break;
          }
          default: {
            out += byte;
          }
        }
      }
    }
  }
};

namespace internal {

class ToonFormatter {
 public:
  static std::string Format(const JsonNode& root) {
    switch (root.type()) {
      case JsonNode::Type::kObject: {
        const auto& obj = root.AsObject();
        if (obj.empty()) {
          return "";
        }
        std::vector<TabularField> fields;
        if (CheckKeyedTabular(root, fields)) {
          std::string header = "[" + std::to_string(obj.size()) + ":]";
          AppendFieldList(fields, header);
          header += ':';
          std::vector<std::string> lines;
          lines.push_back(header);
          for (const auto& [ek, ev] : obj) {
            std::vector<const JsonNode*> cells;
            ExtractLeafCells(ev, fields, cells);
            std::string row = "  " + FormatKey(ek) + ": ";
            for (size_t c = 0; c < cells.size(); ++c) {
              if (c != 0) row += ',';
              row += FormatPrimitive(*cells[c], ',');
            }
            lines.push_back(row);
          }
          std::string res;
          for (size_t i = 0; i < lines.size(); ++i) {
            if (i != 0) res += '\n';
            res += lines[i];
          }
          return res;
        } else {
          std::vector<std::string> lines;
          AppendObjectFields(obj, 0, lines);
          std::string res;
          for (size_t i = 0; i < lines.size(); ++i) {
            if (i != 0) res += '\n';
            res += lines[i];
          }
          return res;
        }
      }
      case JsonNode::Type::kArray: {
        const auto& arr = root.AsArray();
        if (arr.empty()) {
          return "[]";
        }
        std::vector<TabularField> fields;
        if (CheckTabularUniform(arr, fields)) {
          std::string header = "[" + std::to_string(arr.size()) + "]";
          AppendFieldList(fields, header);
          header += ':';
          std::vector<std::string> lines;
          lines.push_back(header);
          for (const auto& el : arr) {
            std::vector<const JsonNode*> cells;
            ExtractLeafCells(el, fields, cells);
            std::string row = "  ";
            for (size_t c = 0; c < cells.size(); ++c) {
              if (c != 0) row += ',';
              row += FormatPrimitive(*cells[c], ',');
            }
            lines.push_back(row);
          }
          std::string res;
          for (size_t i = 0; i < lines.size(); ++i) {
            if (i != 0) res += '\n';
            res += lines[i];
          }
          return res;
        } else if (IsPrimitiveArray(arr)) {
          std::string line = "[" + std::to_string(arr.size()) + "]: ";
          AppendInlineArrayValues(arr, line);
          return line;
        } else {
          std::vector<std::string> lines;
          lines.push_back("[" + std::to_string(arr.size()) + "]:");
          AppendListItems(arr, 1, lines);
          std::string res;
          for (size_t i = 0; i < lines.size(); ++i) {
            if (i != 0) res += '\n';
            res += lines[i];
          }
          return res;
        }
      }
      default: {
        return FormatPrimitive(root, ',');
      }
    }
  }

 private:
  struct TabularField {
    std::string_view name;
    bool is_nested = false;
    std::vector<TabularField> subfields;
  };

  static std::string Indent(int depth) { return std::string(depth * 2, ' '); }

  static std::string FormatNumber(double number) {
    if (!std::isfinite(number)) {
      return "null";
    }
    if (number == 0.0 || number == -0.0) {
      return "0";
    }
    double abs_val = std::abs(number);
    if (abs_val >= 1e-6 && abs_val < 1e21) {
      char buffer[128];
      std::snprintf(buffer, sizeof(buffer), "%.15g", number);
      std::string s(buffer);
      if (s.find('e') != std::string::npos || s.find('E') != std::string::npos) {
        std::snprintf(buffer, sizeof(buffer), "%.10f", number);
        s = buffer;
        size_t dot = s.find('.');
        if (dot != std::string::npos) {
          while (s.back() == '0') {
            s.pop_back();
          }
          if (s.back() == '.') {
            s.pop_back();
          }
        }
      }
      return s;
    } else {
      char buffer[64];
      std::snprintf(buffer, sizeof(buffer), "%.15g", number);
      std::string s(buffer);
      for (char& c : s) {
        if (c == 'E') c = 'e';
      }
      return s;
    }
  }

  static bool IsNumericLike(std::string_view s) {
    if (s.empty()) return false;
    size_t i = 0;
    if (s[i] == '+' || s[i] == '-') {
      ++i;
    }
    if (i >= s.size() || !std::isdigit(static_cast<unsigned char>(s[i]))) {
      return false;
    }
    while (i < s.size() && std::isdigit(static_cast<unsigned char>(s[i]))) {
      ++i;
    }
    if (i < s.size() && s[i] == '.') {
      ++i;
      if (i >= s.size() || !std::isdigit(static_cast<unsigned char>(s[i]))) {
        return false;
      }
      while (i < s.size() && std::isdigit(static_cast<unsigned char>(s[i]))) {
        ++i;
      }
    }
    if (i < s.size() && (s[i] == 'e' || s[i] == 'E')) {
      ++i;
      if (i < s.size() && (s[i] == '+' || s[i] == '-')) {
        ++i;
      }
      if (i >= s.size() || !std::isdigit(static_cast<unsigned char>(s[i]))) {
        return false;
      }
      while (i < s.size() && std::isdigit(static_cast<unsigned char>(s[i]))) {
        ++i;
      }
    }
    return i == s.size();
  }

  static bool NeedsQuoting(std::string_view s, char delim = ',') {
    if (s.empty()) return true;
    if (s.front() == ' ' || s.front() == '\t' || s.back() == ' ' || s.back() == '\t') {
      return true;
    }
    if (s == "true" || s == "false" || s == "null") {
      return true;
    }
    if (IsNumericLike(s)) {
      return true;
    }
    if (s.front() == '-' || s.front() == '#') {
      return true;
    }
    for (unsigned char c : s) {
      if (c < 0x20) return true;
      if (c == ':' || c == '"' || c == '\\' || c == '[' || c == ']' || c == '{' || c == '}') {
        return true;
      }
      if (delim != '\0' && c == static_cast<unsigned char>(delim)) {
        return true;
      }
    }
    return false;
  }

  static bool IsSafeKey(std::string_view key) {
    if (key.empty()) return false;
    unsigned char first = static_cast<unsigned char>(key[0]);
    if (!((first >= 'A' && first <= 'Z') || (first >= 'a' && first <= 'z') || first == '_')) {
      return false;
    }
    for (size_t i = 1; i < key.size(); ++i) {
      unsigned char c = static_cast<unsigned char>(key[i]);
      if (!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
            c == '_' || c == '.')) {
        return false;
      }
    }
    return true;
  }

  static void AppendEscapedString(std::string_view s, std::string& out) {
    static constexpr char kHexDigitsLower[] = "0123456789abcdef";
    out += '"';
    const char* pos = s.data();
    const char* const end = pos + s.size();
    while (true) {
      const uint8_t byte = static_cast<uint8_t>(*pos++);
      if (byte < 0x20) {
        switch (byte) {
          case '\0': {
            if (pos > end) {
              out += '"';
              return;
            } else {
              out += "\\u0000";
              break;
            }
          }
          case '\n': {
            out += "\\n";
            break;
          }
          case '\r': {
            out += "\\r";
            break;
          }
          case '\t': {
            out += "\\t";
            break;
          }
          default: {
            out += "\\u00";
            out += kHexDigitsLower[(byte >> 4) & 0x0F];
            out += kHexDigitsLower[byte & 0x0F];
            break;
          }
        }
      } else if (byte == '"') {
        out += "\\\"";
      } else if (byte == '\\') {
        out += "\\\\";
      } else {
        out += static_cast<char>(byte);
      }
    }
  }

  static std::string FormatKey(std::string_view key) {
    if (IsSafeKey(key)) {
      return std::string(key);
    }
    std::string out;
    AppendEscapedString(key, out);
    return out;
  }

  static std::string FormatString(std::string_view s, char delim = ',') {
    if (!NeedsQuoting(s, delim)) {
      return std::string(s);
    }
    std::string out;
    AppendEscapedString(s, out);
    return out;
  }

  static std::string FormatPrimitive(const JsonNode& node, char delim = ',') {
    switch (node.type()) {
      case JsonNode::Type::kNull:
        return "null";
      case JsonNode::Type::kBool:
        return node.AsBool() ? "true" : "false";
      case JsonNode::Type::kNumber:
        return FormatNumber(node.AsNumber());
      case JsonNode::Type::kString:
        return FormatString(node.AsString(), delim);
      default:
        return "";
    }
  }

  template <typename ElementContainer>
  static bool CheckTabularUniform(const ElementContainer& elements,
                                  std::vector<TabularField>& fields) {
    if (elements.empty()) return false;

    auto get_node = [](const auto& el) -> const JsonNode& {
      if constexpr (std::is_pointer_v<std::decay_t<decltype(el)>>) {
        return *el;
      } else {
        return el;
      }
    };

    // 1. Verify all elements are non-empty objects.
    for (const auto& el : elements) {
      const auto& node = get_node(el);
      if (node.type() != JsonNode::Type::kObject || node.AsObject().empty()) {
        return false;
      }
    }

    const auto& first_obj = get_node(elements[0]).AsObject();
    const size_t field_count = first_obj.size();

    // 2. Sort first object keys and record mapping from sorted position to column index.
    struct KeyIndex {
      std::string_view key;
      size_t orig_idx = 0;
    };
    std::vector<KeyIndex> first_sorted;
    first_sorted.reserve(field_count);
    for (size_t i = 0; i < field_count; ++i) {
      first_sorted.push_back({first_obj[i].first, i});
    }
    std::sort(first_sorted.begin(), first_sorted.end(),
              [](const KeyIndex& a, const KeyIndex& b) { return a.key < b.key; });

    // 3. Bucket values into columns using sorted key mapping without searching.
    std::vector<std::vector<const JsonNode*>> column_nodes(field_count);
    for (auto& col : column_nodes) {
      col.reserve(elements.size());
    }

    struct EntryRef {
      std::string_view key;
      const JsonNode* val = nullptr;
    };
    std::vector<EntryRef> el_sorted;
    el_sorted.reserve(field_count);

    for (const auto& el : elements) {
      const auto& el_obj = get_node(el).AsObject();
      if (el_obj.size() != field_count) return false;

      el_sorted.clear();
      for (const auto& [k, v] : el_obj) {
        el_sorted.push_back({k, &v});
      }
      std::sort(el_sorted.begin(), el_sorted.end(),
                [](const EntryRef& a, const EntryRef& b) { return a.key < b.key; });

      for (size_t s = 0; s < field_count; ++s) {
        if (el_sorted[s].key != first_sorted[s].key) {
          return false;
        }
        column_nodes[first_sorted[s].orig_idx].push_back(el_sorted[s].val);
      }
    }

    // 4. Validate column uniformity across all objects (all primitive or all uniform objects).
    fields.clear();
    fields.reserve(field_count);
    for (size_t field_idx = 0; field_idx < field_count; ++field_idx) {
      std::string_view field_name = first_obj[field_idx].first;
      bool all_primitive = true;
      bool all_objects = true;
      std::vector<const JsonNode*> sub_elements;
      sub_elements.reserve(elements.size());

      for (const JsonNode* val : column_nodes[field_idx]) {
        if (val->type() == JsonNode::Type::kObject) {
          all_primitive = false;
          if (val->AsObject().empty()) {
            all_objects = false;
          } else {
            sub_elements.push_back(val);
          }
        } else if (val->type() == JsonNode::Type::kArray) {
          all_primitive = false;
          all_objects = false;
        } else {
          all_objects = false;
        }
      }

      if (all_primitive) {
        fields.push_back(TabularField{field_name, false, {}});
      } else if (all_objects && !sub_elements.empty()) {
        std::vector<TabularField> sub_fields;
        if (!CheckTabularUniform(sub_elements, sub_fields)) {
          return false;
        }
        fields.push_back(TabularField{field_name, true, std::move(sub_fields)});
      } else {
        return false;
      }
    }
    return true;
  }

  static bool CheckKeyedTabular(const JsonNode& node, std::vector<TabularField>& fields) {
    if (node.type() != JsonNode::Type::kObject) return false;
    const auto& entries = node.AsObject();
    if (entries.size() < 2) return false;
    std::vector<const JsonNode*> entry_values;
    entry_values.reserve(entries.size());
    for (const auto& [k, v] : entries) {
      if (v.type() != JsonNode::Type::kObject || v.AsObject().empty()) {
        return false;
      }
      entry_values.push_back(&v);
    }
    return CheckTabularUniform(entry_values, fields);
  }

  static void ExtractLeafCells(const JsonNode& node, const std::vector<TabularField>& fields,
                               std::vector<const JsonNode*>& cells) {
    const auto& obj = node.AsObject();
    const size_t field_count = fields.size();
    if (obj.size() != field_count) return;

    // 1. Sort fields by name to determine sorted position to column index mapping.
    struct KeyIndex {
      std::string_view key;
      size_t field_idx = 0;
    };
    std::vector<KeyIndex> fields_sorted;
    fields_sorted.reserve(field_count);
    for (size_t i = 0; i < field_count; ++i) {
      fields_sorted.push_back({fields[i].name, i});
    }
    std::sort(fields_sorted.begin(), fields_sorted.end(),
              [](const KeyIndex& a, const KeyIndex& b) { return a.key < b.key; });

    // 2. Sort current object entries by key.
    struct EntryRef {
      std::string_view key;
      const JsonNode* val = nullptr;
    };
    std::vector<EntryRef> obj_sorted;
    obj_sorted.reserve(field_count);
    for (const auto& [k, v] : obj) {
      obj_sorted.push_back({k, &v});
    }
    std::sort(obj_sorted.begin(), obj_sorted.end(),
              [](const EntryRef& a, const EntryRef& b) { return a.key < b.key; });

    // 3. Map sorted entries directly to their column positions.
    std::vector<const JsonNode*> row_values(field_count, nullptr);
    for (size_t s = 0; s < field_count; ++s) {
      row_values[fields_sorted[s].field_idx] = obj_sorted[s].val;
    }

    // 4. Extract leaf cells in field order.
    for (size_t i = 0; i < field_count; ++i) {
      const JsonNode* val = row_values[i];
      if (!val) continue;
      if (fields[i].is_nested) {
        if (val->type() == JsonNode::Type::kObject) {
          ExtractLeafCells(*val, fields[i].subfields, cells);
        }
      } else {
        cells.push_back(val);
      }
    }
  }

  static void AppendFieldList(const std::vector<TabularField>& fields, std::string& out) {
    out += '{';
    for (size_t i = 0; i < fields.size(); ++i) {
      if (i != 0) {
        out += ',';
      }
      out += FormatKey(fields[i].name);
      if (fields[i].is_nested) {
        AppendFieldList(fields[i].subfields, out);
      }
    }
    out += '}';
  }

  static bool IsPrimitiveArray(const std::vector<JsonNode>& arr) {
    for (const auto& item : arr) {
      if (item.type() == JsonNode::Type::kArray || item.type() == JsonNode::Type::kObject) {
        return false;
      }
    }
    return true;
  }

  static void AppendInlineArrayValues(const std::vector<JsonNode>& arr, std::string& out) {
    for (size_t i = 0; i < arr.size(); ++i) {
      if (i != 0) {
        out += ',';
      }
      out += FormatPrimitive(arr[i], ',');
    }
  }

  static void AppendSingleObjectField(const std::string& key, const JsonNode& val, int depth,
                                      std::vector<std::string>& lines) {
    std::vector<TabularField> fields;
    if (val.type() == JsonNode::Type::kArray) {
      AppendArrayField(key, val.AsArray(), depth, lines);
    } else if (val.type() == JsonNode::Type::kObject) {
      if (val.AsObject().empty()) {
        lines.push_back(Indent(depth) + FormatKey(key) + ":");
      } else if (CheckKeyedTabular(val, fields)) {
        std::string header =
            Indent(depth) + FormatKey(key) + "[" + std::to_string(val.AsObject().size()) + ":]";
        AppendFieldList(fields, header);
        header += ':';
        lines.push_back(header);
        for (const auto& [ek, ev] : val.AsObject()) {
          std::vector<const JsonNode*> cells;
          ExtractLeafCells(ev, fields, cells);
          std::string row = Indent(depth + 1) + FormatKey(ek) + ": ";
          for (size_t c = 0; c < cells.size(); ++c) {
            if (c != 0) row += ',';
            row += FormatPrimitive(*cells[c], ',');
          }
          lines.push_back(row);
        }
      } else {
        lines.push_back(Indent(depth) + FormatKey(key) + ":");
        AppendObjectFields(val.AsObject(), depth + 1, lines);
      }
    } else {
      lines.push_back(Indent(depth) + FormatKey(key) + ": " + FormatPrimitive(val, ','));
    }
  }

  static void AppendObjectFields(const std::vector<std::pair<std::string, JsonNode>>& entries,
                                 int depth, std::vector<std::string>& lines) {
    for (const auto& [k, v] : entries) {
      AppendSingleObjectField(k, v, depth, lines);
    }
  }

  static void AppendArrayField(const std::string& key, const std::vector<JsonNode>& arr, int depth,
                               std::vector<std::string>& lines) {
    std::vector<TabularField> fields;
    if (arr.empty()) {
      lines.push_back(Indent(depth) + FormatKey(key) + ": []");
    } else if (CheckTabularUniform(arr, fields)) {
      std::string header = Indent(depth) + FormatKey(key) + "[" + std::to_string(arr.size()) + "]";
      AppendFieldList(fields, header);
      header += ':';
      lines.push_back(header);
      for (const auto& el : arr) {
        std::vector<const JsonNode*> cells;
        ExtractLeafCells(el, fields, cells);
        std::string row = Indent(depth + 1);
        for (size_t c = 0; c < cells.size(); ++c) {
          if (c != 0) row += ',';
          row += FormatPrimitive(*cells[c], ',');
        }
        lines.push_back(row);
      }
    } else if (IsPrimitiveArray(arr)) {
      std::string line = Indent(depth) + FormatKey(key) + "[" + std::to_string(arr.size()) + "]: ";
      AppendInlineArrayValues(arr, line);
      lines.push_back(line);
    } else {
      std::string header = Indent(depth) + FormatKey(key) + "[" + std::to_string(arr.size()) + "]:";
      lines.push_back(header);
      AppendListItems(arr, depth + 1, lines);
    }
  }

  static void AppendListItems(const std::vector<JsonNode>& arr, int depth,
                              std::vector<std::string>& lines) {
    for (const auto& item : arr) {
      if (item.type() == JsonNode::Type::kArray) {
        if (item.AsArray().empty()) {
          lines.push_back(Indent(depth) + "- [0]:");
        } else if (IsPrimitiveArray(item.AsArray())) {
          std::string line = Indent(depth) + "- [" + std::to_string(item.AsArray().size()) + "]: ";
          AppendInlineArrayValues(item.AsArray(), line);
          lines.push_back(line);
        } else {
          std::string header = Indent(depth) + "- [" + std::to_string(item.AsArray().size()) + "]:";
          lines.push_back(header);
          AppendListItems(item.AsArray(), depth + 1, lines);
        }
      } else if (item.type() == JsonNode::Type::kObject) {
        if (item.AsObject().empty()) {
          lines.push_back(Indent(depth) + "-");
        } else {
          AppendObjectAsListItem(item.AsObject(), depth, lines);
        }
      } else {
        lines.push_back(Indent(depth) + "- " + FormatPrimitive(item, ','));
      }
    }
  }

  static void AppendObjectAsListItem(const std::vector<std::pair<std::string, JsonNode>>& obj,
                                     int depth, std::vector<std::string>& lines) {
    if (obj.empty()) {
      lines.push_back(Indent(depth) + "-");
      return;
    }
    const auto& [first_k, first_v] = obj[0];
    std::vector<TabularField> fields;
    if (first_v.type() == JsonNode::Type::kArray &&
        CheckTabularUniform(first_v.AsArray(), fields)) {
      std::string header = Indent(depth) + "- " + FormatKey(first_k) + "[" +
                           std::to_string(first_v.AsArray().size()) + "]";
      AppendFieldList(fields, header);
      header += ':';
      lines.push_back(header);
      for (const auto& el : first_v.AsArray()) {
        std::vector<const JsonNode*> cells;
        ExtractLeafCells(el, fields, cells);
        std::string row = Indent(depth + 2);
        for (size_t c = 0; c < cells.size(); ++c) {
          if (c != 0) row += ',';
          row += FormatPrimitive(*cells[c], ',');
        }
        lines.push_back(row);
      }
    } else if (first_v.type() == JsonNode::Type::kObject && CheckKeyedTabular(first_v, fields)) {
      std::string header = Indent(depth) + "- " + FormatKey(first_k) + "[" +
                           std::to_string(first_v.AsObject().size()) + ":]";
      AppendFieldList(fields, header);
      header += ':';
      lines.push_back(header);
      for (const auto& [ek, ev] : first_v.AsObject()) {
        std::vector<const JsonNode*> cells;
        ExtractLeafCells(ev, fields, cells);
        std::string row = Indent(depth + 2) + FormatKey(ek) + ": ";
        for (size_t c = 0; c < cells.size(); ++c) {
          if (c != 0) row += ',';
          row += FormatPrimitive(*cells[c], ',');
        }
        lines.push_back(row);
      }
    } else if (first_v.type() == JsonNode::Type::kArray) {
      if (first_v.AsArray().empty()) {
        lines.push_back(Indent(depth) + "- " + FormatKey(first_k) + ": []");
      } else if (IsPrimitiveArray(first_v.AsArray())) {
        std::string line = Indent(depth) + "- " + FormatKey(first_k) + "[" +
                           std::to_string(first_v.AsArray().size()) + "]: ";
        AppendInlineArrayValues(first_v.AsArray(), line);
        lines.push_back(line);
      } else {
        std::string header = Indent(depth) + "- " + FormatKey(first_k) + "[" +
                             std::to_string(first_v.AsArray().size()) + "]:";
        lines.push_back(header);
        AppendListItems(first_v.AsArray(), depth + 2, lines);
      }
    } else if (first_v.type() == JsonNode::Type::kObject) {
      if (first_v.AsObject().empty()) {
        lines.push_back(Indent(depth) + "- " + FormatKey(first_k) + ":");
      } else {
        lines.push_back(Indent(depth) + "- " + FormatKey(first_k) + ":");
        AppendObjectFields(first_v.AsObject(), depth + 2, lines);
      }
    } else {
      lines.push_back(Indent(depth) + "- " + FormatKey(first_k) + ": " +
                      FormatPrimitive(first_v, ','));
    }

    for (size_t i = 1; i < obj.size(); ++i) {
      AppendSingleObjectField(obj[i].first, obj[i].second, depth + 1, lines);
    }
  }
};

class YamlFormatter {
 public:
  static std::string Format(const JsonNode& root) {
    switch (root.type()) {
      case JsonNode::Type::kObject: {
        const auto& obj = root.AsObject();
        if (obj.empty()) {
          return "{}";
        }
        std::vector<std::string> lines;
        AppendObjectFields(obj, 0, lines);
        std::string res;
        for (size_t i = 0; i < lines.size(); ++i) {
          if (i != 0) res += '\n';
          res += lines[i];
        }
        return res;
      }
      case JsonNode::Type::kArray: {
        const auto& arr = root.AsArray();
        if (arr.empty()) {
          return "[]";
        }
        std::vector<std::string> lines;
        AppendArrayItems(arr, 0, lines);
        std::string res;
        for (size_t i = 0; i < lines.size(); ++i) {
          if (i != 0) res += '\n';
          res += lines[i];
        }
        return res;
      }
      default: {
        return FormatPrimitive(root);
      }
    }
  }

 private:
  static std::string Indent(int depth) { return std::string(depth * 2, ' '); }

  static std::string FormatNumber(double number) {
    if (std::isnan(number)) {
      return ".nan";
    }
    if (std::isinf(number)) {
      return number > 0 ? ".inf" : "-.inf";
    }
    if (number == 0.0 || number == -0.0) {
      return "0";
    }
    double abs_val = std::abs(number);
    if (abs_val >= 1e-6 && abs_val < 1e21) {
      char buffer[128];
      std::snprintf(buffer, sizeof(buffer), "%.15g", number);
      std::string s(buffer);
      if (s.find('e') != std::string::npos || s.find('E') != std::string::npos) {
        std::snprintf(buffer, sizeof(buffer), "%.10f", number);
        s = buffer;
        size_t dot = s.find('.');
        if (dot != std::string::npos) {
          while (s.back() == '0') {
            s.pop_back();
          }
          if (s.back() == '.') {
            s.pop_back();
          }
        }
      }
      return s;
    } else {
      char buffer[64];
      std::snprintf(buffer, sizeof(buffer), "%.15g", number);
      std::string s(buffer);
      for (char& c : s) {
        if (c == 'E') c = 'e';
      }
      return s;
    }
  }

  static bool EqualsIgnoreCase(const std::string& s, std::string_view target) {
    if (s.size() != target.size()) return false;
    for (size_t i = 0; i < s.size(); ++i) {
      if (std::tolower(static_cast<unsigned char>(s[i])) !=
          std::tolower(static_cast<unsigned char>(target[i]))) {
        return false;
      }
    }
    return true;
  }

  static bool IsYamlKeyword(const std::string& s) {
    return s == "~" || EqualsIgnoreCase(s, "null") || EqualsIgnoreCase(s, "true") ||
           EqualsIgnoreCase(s, "false") || EqualsIgnoreCase(s, "yes") ||
           EqualsIgnoreCase(s, "no") || EqualsIgnoreCase(s, "on") || EqualsIgnoreCase(s, "off") ||
           EqualsIgnoreCase(s, "y") || EqualsIgnoreCase(s, "n");
  }

  static bool IsNumericOrSpecialScalar(const std::string& s) {
    if (s.empty()) return false;
    if (EqualsIgnoreCase(s, ".nan") || EqualsIgnoreCase(s, ".inf") ||
        EqualsIgnoreCase(s, "+.inf") || EqualsIgnoreCase(s, "-.inf")) {
      return true;
    }
    // Check hex, octal, binary
    if (s.size() >= 3 && s[0] == '0') {
      char p = std::tolower(static_cast<unsigned char>(s[1]));
      if (p == 'x' || p == 'o' || p == 'b') {
        return true;
      }
    }
    // Check date pattern YYYY-MM-DD
    if (s.size() >= 10 && std::isdigit(static_cast<unsigned char>(s[0])) &&
        std::isdigit(static_cast<unsigned char>(s[1])) &&
        std::isdigit(static_cast<unsigned char>(s[2])) &&
        std::isdigit(static_cast<unsigned char>(s[3])) && s[4] == '-' &&
        std::isdigit(static_cast<unsigned char>(s[5])) &&
        std::isdigit(static_cast<unsigned char>(s[6])) && s[7] == '-' &&
        std::isdigit(static_cast<unsigned char>(s[8])) &&
        std::isdigit(static_cast<unsigned char>(s[9]))) {
      return true;
    }
    // Check numeric
    size_t i = 0;
    if (s[i] == '+' || s[i] == '-') {
      ++i;
    }
    if (i < s.size() && s[i] == '.') {
      ++i;
      if (i == s.size()) return false;
      while (i < s.size() && std::isdigit(static_cast<unsigned char>(s[i]))) {
        ++i;
      }
      if (i == s.size()) return true;
      if (s[i] == 'e' || s[i] == 'E') {
        ++i;
        if (i < s.size() && (s[i] == '+' || s[i] == '-')) ++i;
        if (i == s.size()) return false;
        while (i < s.size() && std::isdigit(static_cast<unsigned char>(s[i]))) ++i;
        return i == s.size();
      }
      return false;
    }
    if (i < s.size() && std::isdigit(static_cast<unsigned char>(s[i]))) {
      while (i < s.size() && std::isdigit(static_cast<unsigned char>(s[i]))) {
        ++i;
      }
      if (i == s.size()) return true;
      if (s[i] == '.') {
        ++i;
        while (i < s.size() && std::isdigit(static_cast<unsigned char>(s[i]))) ++i;
      }
      if (i < s.size() && (s[i] == 'e' || s[i] == 'E')) {
        ++i;
        if (i < s.size() && (s[i] == '+' || s[i] == '-')) ++i;
        if (i == s.size()) return false;
        while (i < s.size() && std::isdigit(static_cast<unsigned char>(s[i]))) ++i;
      }
      return i == s.size();
    }
    return false;
  }

  static bool NeedsQuoting(const std::string& s) {
    if (s.empty()) return true;
    if (s.front() == ' ' || s.front() == '\t' || s.back() == ' ' || s.back() == '\t') {
      return true;
    }
    if (IsYamlKeyword(s)) {
      return true;
    }
    if (IsNumericOrSpecialScalar(s)) {
      return true;
    }
    char first = s.front();
    if (first == '-' || first == '?' || first == ':' || first == ',' || first == '[' ||
        first == ']' || first == '{' || first == '}' || first == '#' || first == '&' ||
        first == '*' || first == '!' || first == '|' || first == '>' || first == '\'' ||
        first == '"' || first == '%' || first == '@' || first == '`') {
      return true;
    }
    if (s.back() == ':') {
      return true;
    }
    for (size_t i = 0; i < s.size(); ++i) {
      unsigned char c = static_cast<unsigned char>(s[i]);
      if (c < 0x20 || c == 0x7F) return true;
      if (c == '"' || c == '\\') return true;
      if (c == '[' || c == ']' || c == '{' || c == '}' || c == ',') return true;
      if (c == ':' && i + 1 < s.size() && s[i + 1] == ' ') return true;
      if (c == '#' && (i == 0 || s[i - 1] == ' ')) return true;
    }
    return false;
  }

  static bool IsSafeKey(const std::string& key) {
    if (key.empty()) return false;
    if (IsYamlKeyword(key)) return false;
    unsigned char first = static_cast<unsigned char>(key[0]);
    if (!((first >= 'A' && first <= 'Z') || (first >= 'a' && first <= 'z') || first == '_')) {
      return false;
    }
    for (size_t i = 1; i < key.size(); ++i) {
      unsigned char c = static_cast<unsigned char>(key[i]);
      if (!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
            c == '_')) {
        return false;
      }
    }
    return true;
  }

  static void AppendEscapedString(const std::string& s, std::string& out) {
    static constexpr char kHexDigitsLower[] = "0123456789abcdef";
    out += '"';
    const char* pos = s.data();
    const char* const end = pos + s.size();
    while (true) {
      const uint8_t byte = static_cast<uint8_t>(*pos++);
      if (byte < 0x20 || byte == 0x7F) {
        switch (byte) {
          case '\0': {
            if (pos > end) {
              out += '"';
              return;
            } else {
              out += "\\0";
              break;
            }
          }
          case '\a': {
            out += "\\a";
            break;
          }
          case '\b': {
            out += "\\b";
            break;
          }
          case '\t': {
            out += "\\t";
            break;
          }
          case '\n': {
            out += "\\n";
            break;
          }
          case '\v': {
            out += "\\v";
            break;
          }
          case '\f': {
            out += "\\f";
            break;
          }
          case '\r': {
            out += "\\r";
            break;
          }
          case '\x1b': {
            out += "\\e";
            break;
          }
          default: {
            out += "\\u00";
            out += kHexDigitsLower[(byte >> 4) & 0x0F];
            out += kHexDigitsLower[byte & 0x0F];
            break;
          }
        }
      } else if (byte == '"') {
        out += "\\\"";
      } else if (byte == '\\') {
        out += "\\\\";
      } else {
        out += static_cast<char>(byte);
      }
    }
  }

  static std::string FormatKey(const std::string& key) {
    if (IsSafeKey(key)) {
      return key;
    }
    std::string out;
    AppendEscapedString(key, out);
    return out;
  }

  static std::string FormatString(const std::string& s) {
    if (!NeedsQuoting(s)) {
      return s;
    }
    std::string out;
    AppendEscapedString(s, out);
    return out;
  }

  static std::string FormatPrimitive(const JsonNode& node) {
    switch (node.type()) {
      case JsonNode::Type::kNull:
        return "null";
      case JsonNode::Type::kBool:
        return node.AsBool() ? "true" : "false";
      case JsonNode::Type::kNumber:
        return FormatNumber(node.AsNumber());
      case JsonNode::Type::kString:
        return FormatString(node.AsString());
      default:
        return "";
    }
  }

  static void AppendObjectFields(const std::vector<std::pair<std::string, JsonNode>>& entries,
                                 int depth, std::vector<std::string>& lines) {
    for (const auto& [k, v] : entries) {
      if (v.type() == JsonNode::Type::kObject) {
        if (v.AsObject().empty()) {
          lines.push_back(Indent(depth) + FormatKey(k) + ": {}");
        } else {
          lines.push_back(Indent(depth) + FormatKey(k) + ":");
          AppendObjectFields(v.AsObject(), depth + 1, lines);
        }
      } else if (v.type() == JsonNode::Type::kArray) {
        if (v.AsArray().empty()) {
          lines.push_back(Indent(depth) + FormatKey(k) + ": []");
        } else {
          lines.push_back(Indent(depth) + FormatKey(k) + ":");
          AppendArrayItems(v.AsArray(), depth + 1, lines);
        }
      } else {
        lines.push_back(Indent(depth) + FormatKey(k) + ": " + FormatPrimitive(v));
      }
    }
  }

  static void AppendArrayItems(const std::vector<JsonNode>& arr, int depth,
                               std::vector<std::string>& lines) {
    for (const auto& item : arr) {
      if (item.type() == JsonNode::Type::kObject) {
        if (item.AsObject().empty()) {
          lines.push_back(Indent(depth) + "- {}");
        } else {
          AppendObjectAsListItem(item.AsObject(), depth, lines);
        }
      } else if (item.type() == JsonNode::Type::kArray) {
        if (item.AsArray().empty()) {
          lines.push_back(Indent(depth) + "- []");
        } else {
          AppendArrayAsListItem(item.AsArray(), depth, lines);
        }
      } else {
        lines.push_back(Indent(depth) + "- " + FormatPrimitive(item));
      }
    }
  }

  static void AppendObjectAsListItem(const std::vector<std::pair<std::string, JsonNode>>& obj,
                                     int depth, std::vector<std::string>& lines) {
    if (obj.empty()) {
      lines.push_back(Indent(depth) + "- {}");
      return;
    }
    const auto& [first_k, first_v] = obj[0];
    if (first_v.type() == JsonNode::Type::kObject) {
      if (first_v.AsObject().empty()) {
        lines.push_back(Indent(depth) + "- " + FormatKey(first_k) + ": {}");
      } else {
        lines.push_back(Indent(depth) + "- " + FormatKey(first_k) + ":");
        AppendObjectFields(first_v.AsObject(), depth + 2, lines);
      }
    } else if (first_v.type() == JsonNode::Type::kArray) {
      if (first_v.AsArray().empty()) {
        lines.push_back(Indent(depth) + "- " + FormatKey(first_k) + ": []");
      } else {
        lines.push_back(Indent(depth) + "- " + FormatKey(first_k) + ":");
        AppendArrayItems(first_v.AsArray(), depth + 2, lines);
      }
    } else {
      lines.push_back(Indent(depth) + "- " + FormatKey(first_k) + ": " + FormatPrimitive(first_v));
    }

    for (size_t i = 1; i < obj.size(); ++i) {
      const auto& [k, v] = obj[i];
      if (v.type() == JsonNode::Type::kObject) {
        if (v.AsObject().empty()) {
          lines.push_back(Indent(depth + 1) + FormatKey(k) + ": {}");
        } else {
          lines.push_back(Indent(depth + 1) + FormatKey(k) + ":");
          AppendObjectFields(v.AsObject(), depth + 2, lines);
        }
      } else if (v.type() == JsonNode::Type::kArray) {
        if (v.AsArray().empty()) {
          lines.push_back(Indent(depth + 1) + FormatKey(k) + ": []");
        } else {
          lines.push_back(Indent(depth + 1) + FormatKey(k) + ":");
          AppendArrayItems(v.AsArray(), depth + 2, lines);
        }
      } else {
        lines.push_back(Indent(depth + 1) + FormatKey(k) + ": " + FormatPrimitive(v));
      }
    }
  }

  static void AppendArrayAsListItem(const std::vector<JsonNode>& arr, int depth,
                                    std::vector<std::string>& lines) {
    if (arr.empty()) {
      lines.push_back(Indent(depth) + "- []");
      return;
    }
    const auto& first = arr[0];
    if (first.type() == JsonNode::Type::kObject) {
      if (first.AsObject().empty()) {
        lines.push_back(Indent(depth) + "- - {}");
      } else {
        lines.push_back(Indent(depth) + "-");
        AppendArrayItems(arr, depth + 1, lines);
        return;
      }
    } else if (first.type() == JsonNode::Type::kArray) {
      lines.push_back(Indent(depth) + "-");
      AppendArrayItems(arr, depth + 1, lines);
      return;
    } else {
      lines.push_back(Indent(depth) + "- - " + FormatPrimitive(first));
    }

    for (size_t i = 1; i < arr.size(); ++i) {
      const auto& item = arr[i];
      if (item.type() == JsonNode::Type::kObject) {
        if (item.AsObject().empty()) {
          lines.push_back(Indent(depth + 1) + "- {}");
        } else {
          AppendObjectAsListItem(item.AsObject(), depth + 1, lines);
        }
      } else if (item.type() == JsonNode::Type::kArray) {
        if (item.AsArray().empty()) {
          lines.push_back(Indent(depth + 1) + "- []");
        } else {
          AppendArrayAsListItem(item.AsArray(), depth + 1, lines);
        }
      } else {
        lines.push_back(Indent(depth + 1) + "- " + FormatPrimitive(item));
      }
    }
  }
};

class JsonParser {
 public:
  static ParseResult<JsonNode> Parse(std::string_view input) {
    JsonParser parser(input);
    return parser.ParseRoot();
  }

 private:
  explicit JsonParser(std::string_view input) : input_(input) {}

  std::string_view input_;
  size_t pos_ = 0;

  void SkipWhitespace() {
    while (pos_ < input_.size()) {
      char c = input_[pos_];
      if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
        ++pos_;
      } else {
        break;
      }
    }
  }

  static int HexDigit(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
  }

  static void AppendUtf8(uint32_t cp, std::string& out) {
    if (cp <= 0x7F) {
      out += static_cast<char>(cp);
    } else if (cp <= 0x7FF) {
      out += static_cast<char>(0xC0 | (cp >> 6));
      out += static_cast<char>(0x80 | (cp & 0x3F));
    } else if (cp <= 0xFFFF) {
      out += static_cast<char>(0xE0 | (cp >> 12));
      out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
      out += static_cast<char>(0x80 | (cp & 0x3F));
    } else {
      out += static_cast<char>(0xF0 | (cp >> 18));
      out += static_cast<char>(0x80 | ((cp >> 12) & 0x3F));
      out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
      out += static_cast<char>(0x80 | (cp & 0x3F));
    }
  }

  ParseResult<JsonNode> ParseRoot() {
    SkipWhitespace();
    if (pos_ >= input_.size()) {
      return ParseError{"Empty input", 0};
    }
    auto res = ParseValue();
    if (std::holds_alternative<ParseError>(res)) {
      return res;
    }
    SkipWhitespace();
    if (pos_ < input_.size()) {
      return ParseError{"Unexpected trailing content after JSON value", pos_};
    }
    return res;
  }

  ParseResult<JsonNode> ParseValue() {
    SkipWhitespace();
    if (pos_ >= input_.size()) {
      return ParseError{"Unexpected end of input", pos_};
    }
    char c = input_[pos_];
    switch (c) {
      case 'n':
        return ParseNull();
      case 't':
        return ParseTrue();
      case 'f':
        return ParseFalse();
      case '"':
        return ParseStringNode();
      case '[':
        return ParseArray();
      case '{':
        return ParseObject();
      case '-':
      case '0':
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
        return ParseNumber();
      default:
        return ParseError{std::string("Unexpected character: '") + c + "'", pos_};
    }
  }

  ParseResult<JsonNode> ParseNull() {
    size_t start = pos_;
    if (pos_ + 4 <= input_.size() && input_.substr(pos_, 4) == "null") {
      pos_ += 4;
      return JsonNode(std::nullopt);
    }
    return ParseError{"Expected 'null'", start};
  }

  ParseResult<JsonNode> ParseTrue() {
    size_t start = pos_;
    if (pos_ + 4 <= input_.size() && input_.substr(pos_, 4) == "true") {
      pos_ += 4;
      return JsonNode(true);
    }
    return ParseError{"Expected 'true'", start};
  }

  ParseResult<JsonNode> ParseFalse() {
    size_t start = pos_;
    if (pos_ + 5 <= input_.size() && input_.substr(pos_, 5) == "false") {
      pos_ += 5;
      return JsonNode(false);
    }
    return ParseError{"Expected 'false'", start};
  }

  ParseResult<JsonNode> ParseNumber() {
    size_t start = pos_;
    if (pos_ < input_.size() && input_[pos_] == '-') {
      ++pos_;
    }
    if (pos_ >= input_.size()) {
      return ParseError{"Expected digit after '-'", start};
    }
    if (input_[pos_] == '0') {
      ++pos_;
      if (pos_ < input_.size() && input_[pos_] >= '0' && input_[pos_] <= '9') {
        return ParseError{"Invalid leading zero in number", start};
      }
    } else if (input_[pos_] >= '1' && input_[pos_] <= '9') {
      while (pos_ < input_.size() && input_[pos_] >= '0' && input_[pos_] <= '9') {
        ++pos_;
      }
    } else {
      return ParseError{"Expected digit for number", start};
    }

    if (pos_ < input_.size() && input_[pos_] == '.') {
      ++pos_;
      if (pos_ >= input_.size() || input_[pos_] < '0' || input_[pos_] > '9') {
        return ParseError{"Expected digit after '.'", start};
      }
      while (pos_ < input_.size() && input_[pos_] >= '0' && input_[pos_] <= '9') {
        ++pos_;
      }
    }

    if (pos_ < input_.size() && (input_[pos_] == 'e' || input_[pos_] == 'E')) {
      ++pos_;
      if (pos_ < input_.size() && (input_[pos_] == '+' || input_[pos_] == '-')) {
        ++pos_;
      }
      if (pos_ >= input_.size() || input_[pos_] < '0' || input_[pos_] > '9') {
        return ParseError{"Expected digit for exponent", start};
      }
      while (pos_ < input_.size() && input_[pos_] >= '0' && input_[pos_] <= '9') {
        ++pos_;
      }
    }

    std::string s(input_.substr(start, pos_ - start));
    char* end_ptr = nullptr;
    double val = std::strtod(s.c_str(), &end_ptr);
    if (end_ptr != s.c_str() + s.size()) {
      return ParseError{"Invalid number format", start};
    }
    return JsonNode(val);
  }

  ParseResult<std::string> ParseRawString() {
    size_t start = pos_;
    if (pos_ >= input_.size() || input_[pos_] != '"') {
      return ParseError{"Expected '\"'", start};
    }
    ++pos_;
    std::string result;
    while (pos_ < input_.size()) {
      unsigned char c = static_cast<unsigned char>(input_[pos_++]);
      if (c == '"') {
        return result;
      }
      if (c == '\\') {
        if (pos_ >= input_.size()) {
          return ParseError{"Unterminated escape sequence in string", pos_ - 1};
        }
        char esc = input_[pos_++];
        switch (esc) {
          case '"':
            result += '"';
            break;
          case '\\':
            result += '\\';
            break;
          case '/':
            result += '/';
            break;
          case 'b':
            result += '\b';
            break;
          case 'f':
            result += '\f';
            break;
          case 'n':
            result += '\n';
            break;
          case 'r':
            result += '\r';
            break;
          case 't':
            result += '\t';
            break;
          case 'u': {
            if (pos_ + 4 > input_.size()) {
              return ParseError{"Incomplete unicode escape sequence", pos_ - 2};
            }
            uint32_t cp = 0;
            for (int i = 0; i < 4; ++i) {
              int h = HexDigit(input_[pos_++]);
              if (h < 0) {
                return ParseError{"Invalid hex digit in unicode escape", pos_ - 1};
              }
              cp = (cp << 4) | static_cast<uint32_t>(h);
            }
            if (cp >= 0xD800 && cp <= 0xDBFF) {
              if (pos_ + 6 > input_.size() || input_[pos_] != '\\' || input_[pos_ + 1] != 'u') {
                return ParseError{"Expected low surrogate after high surrogate", pos_};
              }
              pos_ += 2;
              uint32_t lo = 0;
              for (int i = 0; i < 4; ++i) {
                int h = HexDigit(input_[pos_++]);
                if (h < 0) {
                  return ParseError{"Invalid hex digit in unicode escape", pos_ - 1};
                }
                lo = (lo << 4) | static_cast<uint32_t>(h);
              }
              if (lo < 0xDC00 || lo > 0xDFFF) {
                return ParseError{"Invalid low surrogate in unicode escape", pos_ - 4};
              }
              cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
            } else if (cp >= 0xDC00 && cp <= 0xDFFF) {
              return ParseError{"Unpaired low surrogate in unicode escape", pos_ - 4};
            }
            AppendUtf8(cp, result);
            break;
          }
          default:
            return ParseError{std::string("Invalid escape character: '\\") + esc + "'", pos_ - 2};
        }
      } else if (c < 0x20) {
        return ParseError{"Unescaped control character in string", pos_ - 1};
      } else {
        result += static_cast<char>(c);
      }
    }
    return ParseError{"Unterminated string", start};
  }

  ParseResult<JsonNode> ParseStringNode() {
    auto str_res = ParseRawString();
    if (std::holds_alternative<ParseError>(str_res)) {
      return std::get<ParseError>(str_res);
    }
    return JsonNode(std::get<std::string>(str_res));
  }

  ParseResult<JsonNode> ParseArray() {
    size_t start = pos_;
    ++pos_;  // consume '['
    SkipWhitespace();
    if (pos_ < input_.size() && input_[pos_] == ']') {
      ++pos_;
      return JsonNode(std::vector<JsonNode>{});
    }

    std::vector<JsonNode> elements;
    while (true) {
      SkipWhitespace();
      if (pos_ >= input_.size()) {
        return ParseError{"Unterminated array", start};
      }
      auto val_res = ParseValue();
      if (std::holds_alternative<ParseError>(val_res)) {
        return val_res;
      }
      elements.push_back(std::move(std::get<JsonNode>(val_res)));

      SkipWhitespace();
      if (pos_ >= input_.size()) {
        return ParseError{"Unterminated array", start};
      }
      char c = input_[pos_++];
      if (c == ']') {
        break;
      } else if (c == ',') {
        SkipWhitespace();
        if (pos_ < input_.size() && input_[pos_] == ']') {
          return ParseError{"Trailing comma in array", pos_ - 1};
        }
      } else {
        return ParseError{std::string("Expected ',' or ']' in array, got '") + c + "'", pos_ - 1};
      }
    }
    return JsonNode(std::move(elements));
  }

  ParseResult<JsonNode> ParseObject() {
    size_t start = pos_;
    ++pos_;  // consume '{'
    SkipWhitespace();
    if (pos_ < input_.size() && input_[pos_] == '}') {
      ++pos_;
      return JsonNode(std::vector<std::pair<std::string, JsonNode>>{});
    }

    std::vector<std::pair<std::string, JsonNode>> entries;
    while (true) {
      SkipWhitespace();
      if (pos_ >= input_.size()) {
        return ParseError{"Unterminated object", start};
      }
      if (input_[pos_] != '"') {
        return ParseError{"Expected string key in object", pos_};
      }
      auto key_res = ParseRawString();
      if (std::holds_alternative<ParseError>(key_res)) {
        return std::get<ParseError>(key_res);
      }
      std::string key = std::move(std::get<std::string>(key_res));

      SkipWhitespace();
      if (pos_ >= input_.size() || input_[pos_] != ':') {
        return ParseError{"Expected ':' after key in object", pos_};
      }
      ++pos_;  // consume ':'

      SkipWhitespace();
      auto val_res = ParseValue();
      if (std::holds_alternative<ParseError>(val_res)) {
        return val_res;
      }
      entries.emplace_back(std::move(key), std::move(std::get<JsonNode>(val_res)));

      SkipWhitespace();
      if (pos_ >= input_.size()) {
        return ParseError{"Unterminated object", start};
      }
      char c = input_[pos_++];
      if (c == '}') {
        break;
      } else if (c == ',') {
        SkipWhitespace();
        if (pos_ < input_.size() && input_[pos_] == '}') {
          return ParseError{"Trailing comma in object", pos_ - 1};
        }
      } else {
        return ParseError{std::string("Expected ',' or '}' in object, got '") + c + "'", pos_ - 1};
      }
    }
    return JsonNode(std::move(entries));
  }
};

}  // namespace internal

inline ParseResult<JsonNode> JsonNode::ParseJson(std::string_view json) {
  return internal::JsonParser::Parse(json);
}

inline std::string JsonNode::ToToon() const { return internal::ToonFormatter::Format(*this); }

inline std::string JsonNode::ToYaml() const { return internal::YamlFormatter::Format(*this); }

}  // namespace typeprompt
