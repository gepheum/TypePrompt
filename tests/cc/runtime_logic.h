#pragma once

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstddef>
#include <cstdio>
#include <cstdlib>
#include <format>
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
};

// Represents either a successfully parsed value of type T or a ParseError.
template <typename T>
class ParseResult {
 public:
  // Constructs a successful ParseResult containing ok_value.
  constexpr ParseResult(T ok_value) : data_(std::move(ok_value)) {}

  // Constructs a failed ParseResult containing error.
  ParseResult(ParseError error) : data_(std::move(error)) {}

  ParseResult(const ParseResult& other) = default;
  ParseResult(ParseResult&& other) = default;

  ParseResult& operator=(const ParseResult& other) = default;
  ParseResult& operator=(ParseResult&& other) = default;

  // Returns true if the result contains a parsed value, false if it contains a ParseError.
  constexpr bool ok() const { return data_.index() == 0; }

  // Returns a reference to the parsed value. Precondition: ok() must be true.
  constexpr const T& operator*() const& { return std::get<0>(data_); }
  constexpr T& operator*() & { return std::get<0>(data_); }
  constexpr T&& operator*() && { return std::get<0>(std::move(data_)); }

  // Member access operator for the parsed value. Precondition: ok() must be true.
  constexpr const T* operator->() const { return &std::get<0>(data_); }
  constexpr T* operator->() { return &std::get<0>(data_); }

  // Returns a reference to the error. Precondition: ok() must be false.
  const ParseError& error() const& { return std::get<1>(data_); }
  ParseError& error() & { return std::get<1>(data_); }
  ParseError&& error() && { return std::get<1>(std::move(data_)); }

 private:
  std::variant<T, ParseError> data_;
};

// Represents either a successful parsing operation or a ParseError.
using ParseStatus = ParseResult<std::nullopt_t>;

inline constexpr ParseStatus kOkStatus = std::nullopt;

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

  // Represents a JSON array.
  using Array = std::vector<JsonNode>;
  // Represents a JSON object as an ordered list of key-value pairs.
  using Object = std::vector<std::pair<std::string, JsonNode>>;

  JsonNode() : data_(std::nullopt) {}
  explicit JsonNode(std::nullopt_t value) : data_(value) {}
  explicit JsonNode(bool value) : data_(value) {}
  explicit JsonNode(int value) : data_(static_cast<double>(value)) {}
  explicit JsonNode(double value) : data_(value) {}
  explicit JsonNode(const char* value) : data_(NormalizeUtf8(value)) {}
  explicit JsonNode(std::string_view value) : data_(NormalizeUtf8(value)) {}
  explicit JsonNode(Array value) : data_(std::move(value)) {}
  explicit JsonNode(Object value) : data_(NormalizeUtf8(std::move(value))) {}

  JsonNode(const JsonNode&) = default;
  JsonNode(JsonNode&&) = default;

  JsonNode& operator=(const JsonNode&) = default;
  JsonNode& operator=(JsonNode&&) = default;

  static ParseResult<JsonNode> ParseJson(std::string_view json);

  // Returns the JSON type of this node.
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
          } else if constexpr (std::is_same_v<T, Array>) {
            return Type::kArray;
          } else if constexpr (std::is_same_v<T, Object>) {
            return Type::kObject;
          }
        },
        data_);
  }

  // Returns the boolean value. Precondition: type() == Type::kBool.
  bool bool_value() const { return std::get<bool>(data_); }

  // Returns the numeric value. Precondition: type() == Type::kNumber.
  double number_value() const { return std::get<double>(data_); }

  // Returns the string value. Precondition: type() == Type::kString.
  const std::string& string_value() const& { return std::get<std::string>(data_); }
  std::string string_value() && { return std::get<std::string>(std::move(data_)); }

  // Returns the array elements. Precondition: type() == Type::kArray.
  const Array& array_value() const& { return std::get<Array>(data_); }
  Array array_value() && { return std::get<Array>(std::move(data_)); }

  // Returns the object key-value pairs. Precondition: type() == Type::kObject.
  const Object& object_value() const& { return std::get<Object>(data_); }
  Object object_value() && { return std::get<Object>(std::move(data_)); }

  // Formats this node as a compact JSON string.
  std::string ToJson() const {
    std::string json;
    std::string eolIndent;
    AppendJson(json, eolIndent);
    return json;
  }

  // Formats this node as an indented, multi-line JSON string.
  std::string ToJsonWithIndent() const {
    std::string json;
    std::string eolIndent = "\n";
    AppendJson(json, eolIndent);
    return json;
  }

  // Formats this node in TOON (Token-Oriented Object Notation) format.
  inline std::string ToToon() const;

  // Formats this node in YAML format.
  inline std::string ToYaml() const;

 private:
  std::variant<std::nullopt_t, bool, double, std::string, Array, Object> data_;

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

  static Object NormalizeUtf8(Object value) {
    for (auto& entry : value) {
      entry.first = NormalizeUtf8(entry.first);
    }
    return value;
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

  void AppendJson(std::string& out, std::string& eolIndent) const {
    switch (type()) {
      case Type::kNull: {
        out += "null";
        break;
      }
      case Type::kBool: {
        out += bool_value() ? "true" : "false";
        break;
      }
      case Type::kNumber: {
        double number = number_value();
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
        AppendJsonString(string_value(), out);
        break;
      }
      case Type::kArray: {
        const Array& array = array_value();
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
        const Object& object = object_value();
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

  static void AppendJsonString(std::string_view value, std::string& out) {
    static constexpr char kHexDigits[] = "0123456789ABCDEF";
    out += '"';
    for (const char c : value) {
      const uint8_t byte = static_cast<uint8_t>(c);
      if (byte < 0x20) {
        switch (byte) {
          case '\b':
            out += "\\b";
            break;
          case '\f':
            out += "\\f";
            break;
          case '\n':
            out += "\\n";
            break;
          case '\r':
            out += "\\r";
            break;
          case '\t':
            out += "\\t";
            break;
          default:
            out += "\\u00";
            out += kHexDigits[(byte >> 4) & 0x0F];
            out += kHexDigits[byte & 0x0F];
            break;
        }
      } else if (byte == '"') {
        out += "\\\"";
      } else if (byte == '\\') {
        out += "\\\\";
      } else {
        out += c;
      }
    }
    out += '"';
  }
};

inline JsonNode ToJsonNode(const JsonNode& node) { return node; }
inline JsonNode ToJsonNode(bool value) { return JsonNode(value); }
inline JsonNode ToJsonNode(int value) { return JsonNode(value); }
inline JsonNode ToJsonNode(double value) { return JsonNode(value); }
inline JsonNode ToJsonNode(std::string_view value) { return JsonNode(value); }

template <typename T>
JsonNode ToJsonNode(const std::optional<T>& value) {
  return value.has_value() ? ToJsonNode(*value) : JsonNode(std::nullopt);
}

template <typename T>
JsonNode ToJsonNode(const std::vector<T>& values) {
  std::vector<JsonNode> elements;
  elements.reserve(values.size());
  for (const auto& item : values) {
    elements.push_back(ToJsonNode(item));
  }
  return JsonNode(std::move(elements));
}

inline ParseStatus ParseJsonNode(const JsonNode& node, JsonNode& out) {
  out = node;
  return kOkStatus;
}

inline ParseStatus ParseJsonNode(const JsonNode& node, bool& out) {
  if (node.type() != JsonNode::Type::kBool) {
    return ParseError{"Expected boolean"};
  }
  out = node.bool_value();
  return kOkStatus;
}

inline ParseStatus ParseJsonNode(const JsonNode& node, int& out) {
  if (node.type() != JsonNode::Type::kNumber) {
    return ParseError{"Expected number"};
  }
  out = static_cast<int>(node.number_value());
  return kOkStatus;
}

inline ParseStatus ParseJsonNode(const JsonNode& node, double& out) {
  if (node.type() != JsonNode::Type::kNumber) {
    return ParseError{"Expected number"};
  }
  out = node.number_value();
  return kOkStatus;
}

inline ParseStatus ParseJsonNode(const JsonNode& node, std::string& out) {
  if (node.type() != JsonNode::Type::kString) {
    return ParseError{"Expected string"};
  }
  out = node.string_value();
  return kOkStatus;
}

template <typename T>
ParseStatus ParseJsonNode(const JsonNode& node, std::optional<T>& out) {
  if (node.type() == JsonNode::Type::kNull) {
    out = std::nullopt;
    return kOkStatus;
  }
  T val{};
  ParseStatus status = ParseJsonNode(node, val);
  if (!status.ok()) {
    return status;
  }
  out = std::move(val);
  return kOkStatus;
}

template <typename T>
ParseStatus ParseJsonNode(const JsonNode& node, std::vector<T>& out) {
  if (node.type() != JsonNode::Type::kArray) {
    return ParseError{"Expected array"};
  }
  const auto& arr = node.array_value();
  std::vector<T> elements;
  elements.reserve(arr.size());
  for (const auto& item : arr) {
    T val{};
    ParseStatus status = ParseJsonNode(item, val);
    if (!status.ok()) {
      return status;
    }
    elements.push_back(std::move(val));
  }
  out = std::move(elements);
  return kOkStatus;
}

template <typename T>
ParseResult<T> ParseJsonNode(const JsonNode& node) {
  T result{};
  ParseStatus status = ParseJsonNode(node, result);
  if (status.ok()) {
    return std::move(result);
  } else {
    return std::move(status).error();
  }
}

template <typename T>
ParseResult<T> ParseJsonNode(std::string_view json) {
  ParseResult<JsonNode> node_result = JsonNode::ParseJson(json);
  if (node_result.ok()) {
    return ParseJsonNode<T>(*node_result);
  } else {
    return std::move(node_result).error();
  }
}

namespace internal {

class ToonFormatter {
 public:
  static std::string Format(const JsonNode& root) {
    switch (root.type()) {
      case JsonNode::Type::kObject: {
        const JsonNode::Object& obj = root.object_value();
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
        const std::vector<JsonNode>& arr = root.array_value();
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
          for (const JsonNode& el : arr) {
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
          while (!s.empty() && s.back() == '0') {
            s.pop_back();
          }
          if (!s.empty() && s.back() == '.') {
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
    for (const char c : s) {
      const uint8_t byte = static_cast<uint8_t>(c);
      if (byte < 0x20) {
        switch (byte) {
          case '\n':
            out += "\\n";
            break;
          case '\r':
            out += "\\r";
            break;
          case '\t':
            out += "\\t";
            break;
          default:
            out += "\\u00";
            out += kHexDigitsLower[(byte >> 4) & 0x0F];
            out += kHexDigitsLower[byte & 0x0F];
            break;
        }
      } else if (byte == '"') {
        out += "\\\"";
      } else if (byte == '\\') {
        out += "\\\\";
      } else {
        out += c;
      }
    }
    out += '"';
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
        return node.bool_value() ? "true" : "false";
      case JsonNode::Type::kNumber:
        return FormatNumber(node.number_value());
      case JsonNode::Type::kString:
        return FormatString(node.string_value(), delim);
      default:
        return "";
    }
  }

  template <typename ElementContainer>
  static bool CheckTabularUniform(const ElementContainer& elements,
                                  std::vector<TabularField>& fields) {
    if (elements.empty()) return false;

    const auto get_node = [](const auto& el) -> const JsonNode& {
      if constexpr (std::is_pointer_v<std::decay_t<decltype(el)>>) {
        return *el;
      } else {
        return el;
      }
    };

    // 1. Verify all elements are non-empty objects.
    for (const auto& el : elements) {
      const auto& node = get_node(el);
      if (node.type() != JsonNode::Type::kObject || node.object_value().empty()) {
        return false;
      }
    }

    const auto& first_obj = get_node(elements[0]).object_value();
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
      const auto& el_obj = get_node(el).object_value();
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
          if (val->object_value().empty()) {
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
    const JsonNode::Object& entries = node.object_value();
    if (entries.size() < 2) return false;
    std::vector<const JsonNode*> entry_values;
    entry_values.reserve(entries.size());
    for (const auto& [k, v] : entries) {
      if (v.type() != JsonNode::Type::kObject || v.object_value().empty()) {
        return false;
      }
      entry_values.push_back(&v);
    }
    return CheckTabularUniform(entry_values, fields);
  }

  static void ExtractLeafCells(const JsonNode& node, const std::vector<TabularField>& fields,
                               std::vector<const JsonNode*>& cells) {
    if (node.type() != JsonNode::Type::kObject) return;
    const JsonNode::Object& obj = node.object_value();
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
      if (obj_sorted[s].key != fields_sorted[s].key) return;
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
    for (const JsonNode& item : arr) {
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
      AppendArrayField(key, val.array_value(), depth, lines);
    } else if (val.type() == JsonNode::Type::kObject) {
      if (val.object_value().empty()) {
        lines.push_back(Indent(depth) + FormatKey(key) + ":");
      } else if (CheckKeyedTabular(val, fields)) {
        std::string header =
            Indent(depth) + FormatKey(key) + "[" + std::to_string(val.object_value().size()) + ":]";
        AppendFieldList(fields, header);
        header += ':';
        lines.push_back(header);
        for (const auto& [ek, ev] : val.object_value()) {
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
        AppendObjectFields(val.object_value(), depth + 1, lines);
      }
    } else {
      lines.push_back(Indent(depth) + FormatKey(key) + ": " + FormatPrimitive(val, ','));
    }
  }

  static void AppendObjectFields(const JsonNode::Object& entries, int depth,
                                 std::vector<std::string>& lines) {
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
      for (const JsonNode& el : arr) {
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
    for (const JsonNode& item : arr) {
      if (item.type() == JsonNode::Type::kArray) {
        if (item.array_value().empty()) {
          lines.push_back(Indent(depth) + "- [0]:");
        } else if (IsPrimitiveArray(item.array_value())) {
          std::string line =
              Indent(depth) + "- [" + std::to_string(item.array_value().size()) + "]: ";
          AppendInlineArrayValues(item.array_value(), line);
          lines.push_back(line);
        } else {
          std::string header =
              Indent(depth) + "- [" + std::to_string(item.array_value().size()) + "]:";
          lines.push_back(header);
          AppendListItems(item.array_value(), depth + 1, lines);
        }
      } else if (item.type() == JsonNode::Type::kObject) {
        if (item.object_value().empty()) {
          lines.push_back(Indent(depth) + "-");
        } else {
          AppendObjectAsListItem(item.object_value(), depth, lines);
        }
      } else {
        lines.push_back(Indent(depth) + "- " + FormatPrimitive(item, ','));
      }
    }
  }

  static void AppendObjectAsListItem(const JsonNode::Object& obj, int depth,
                                     std::vector<std::string>& lines) {
    if (obj.empty()) {
      lines.push_back(Indent(depth) + "-");
      return;
    }
    const auto& [first_k, first_v] = obj[0];
    std::vector<TabularField> fields;
    if (first_v.type() == JsonNode::Type::kArray &&
        CheckTabularUniform(first_v.array_value(), fields)) {
      std::string header = Indent(depth) + "- " + FormatKey(first_k) + "[" +
                           std::to_string(first_v.array_value().size()) + "]";
      AppendFieldList(fields, header);
      header += ':';
      lines.push_back(header);
      for (const JsonNode& el : first_v.array_value()) {
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
                           std::to_string(first_v.object_value().size()) + ":]";
      AppendFieldList(fields, header);
      header += ':';
      lines.push_back(header);
      for (const auto& [ek, ev] : first_v.object_value()) {
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
      if (first_v.array_value().empty()) {
        lines.push_back(Indent(depth) + "- " + FormatKey(first_k) + ": []");
      } else if (IsPrimitiveArray(first_v.array_value())) {
        std::string line = Indent(depth) + "- " + FormatKey(first_k) + "[" +
                           std::to_string(first_v.array_value().size()) + "]: ";
        AppendInlineArrayValues(first_v.array_value(), line);
        lines.push_back(line);
      } else {
        std::string header = Indent(depth) + "- " + FormatKey(first_k) + "[" +
                             std::to_string(first_v.array_value().size()) + "]:";
        lines.push_back(header);
        AppendListItems(first_v.array_value(), depth + 2, lines);
      }
    } else if (first_v.type() == JsonNode::Type::kObject) {
      if (first_v.object_value().empty()) {
        lines.push_back(Indent(depth) + "- " + FormatKey(first_k) + ":");
      } else {
        lines.push_back(Indent(depth) + "- " + FormatKey(first_k) + ":");
        AppendObjectFields(first_v.object_value(), depth + 2, lines);
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
        const JsonNode::Object& obj = root.object_value();
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
        const std::vector<JsonNode>& arr = root.array_value();
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
          while (!s.empty() && s.back() == '0') {
            s.pop_back();
          }
          if (!s.empty() && s.back() == '.') {
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

  static bool EqualsIgnoreCase(std::string_view s, std::string_view target) {
    if (s.size() != target.size()) return false;
    for (size_t i = 0; i < s.size(); ++i) {
      if (std::tolower(static_cast<unsigned char>(s[i])) !=
          std::tolower(static_cast<unsigned char>(target[i]))) {
        return false;
      }
    }
    return true;
  }

  static bool IsYamlKeyword(std::string_view s) {
    return s == "~" || EqualsIgnoreCase(s, "null") || EqualsIgnoreCase(s, "true") ||
           EqualsIgnoreCase(s, "false") || EqualsIgnoreCase(s, "yes") ||
           EqualsIgnoreCase(s, "no") || EqualsIgnoreCase(s, "on") || EqualsIgnoreCase(s, "off") ||
           EqualsIgnoreCase(s, "y") || EqualsIgnoreCase(s, "n");
  }

  static bool IsNumericOrSpecialScalar(std::string_view s) {
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

  static bool NeedsQuoting(std::string_view s) {
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

  static bool IsSafeKey(std::string_view key) {
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

  static void AppendEscapedString(std::string_view s, std::string& out) {
    static constexpr char kHexDigitsLower[] = "0123456789abcdef";
    out += '"';
    for (const char c : s) {
      const uint8_t byte = static_cast<uint8_t>(c);
      if (byte < 0x20 || byte == 0x7F) {
        switch (byte) {
          case '\0': {
            out += "\\0";
            break;
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
    out += '"';
  }

  static std::string FormatKey(std::string_view key) {
    if (IsSafeKey(key)) {
      return std::string(key);
    }
    std::string out;
    AppendEscapedString(key, out);
    return out;
  }

  static std::string FormatString(std::string_view s) {
    if (!NeedsQuoting(s)) {
      return std::string(s);
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
        return node.bool_value() ? "true" : "false";
      case JsonNode::Type::kNumber:
        return FormatNumber(node.number_value());
      case JsonNode::Type::kString:
        return FormatString(node.string_value());
      default:
        return "";
    }
  }

  static void AppendObjectFields(const JsonNode::Object& entries, int depth,
                                 std::vector<std::string>& lines) {
    for (const auto& [k, v] : entries) {
      if (v.type() == JsonNode::Type::kObject) {
        if (v.object_value().empty()) {
          lines.push_back(Indent(depth) + FormatKey(k) + ": {}");
        } else {
          lines.push_back(Indent(depth) + FormatKey(k) + ":");
          AppendObjectFields(v.object_value(), depth + 1, lines);
        }
      } else if (v.type() == JsonNode::Type::kArray) {
        if (v.array_value().empty()) {
          lines.push_back(Indent(depth) + FormatKey(k) + ": []");
        } else {
          lines.push_back(Indent(depth) + FormatKey(k) + ":");
          AppendArrayItems(v.array_value(), depth + 1, lines);
        }
      } else {
        lines.push_back(Indent(depth) + FormatKey(k) + ": " + FormatPrimitive(v));
      }
    }
  }

  static void AppendArrayItems(const std::vector<JsonNode>& arr, int depth,
                               std::vector<std::string>& lines) {
    for (const JsonNode& item : arr) {
      if (item.type() == JsonNode::Type::kObject) {
        if (item.object_value().empty()) {
          lines.push_back(Indent(depth) + "- {}");
        } else {
          AppendObjectAsListItem(item.object_value(), depth, lines);
        }
      } else if (item.type() == JsonNode::Type::kArray) {
        if (item.array_value().empty()) {
          lines.push_back(Indent(depth) + "- []");
        } else {
          AppendArrayAsListItem(item.array_value(), depth, lines);
        }
      } else {
        lines.push_back(Indent(depth) + "- " + FormatPrimitive(item));
      }
    }
  }

  static void AppendObjectAsListItem(const JsonNode::Object& obj, int depth,
                                     std::vector<std::string>& lines) {
    if (obj.empty()) {
      lines.push_back(Indent(depth) + "- {}");
      return;
    }
    const auto& [first_k, first_v] = obj[0];
    if (first_v.type() == JsonNode::Type::kObject) {
      if (first_v.object_value().empty()) {
        lines.push_back(Indent(depth) + "- " + FormatKey(first_k) + ": {}");
      } else {
        lines.push_back(Indent(depth) + "- " + FormatKey(first_k) + ":");
        AppendObjectFields(first_v.object_value(), depth + 2, lines);
      }
    } else if (first_v.type() == JsonNode::Type::kArray) {
      if (first_v.array_value().empty()) {
        lines.push_back(Indent(depth) + "- " + FormatKey(first_k) + ": []");
      } else {
        lines.push_back(Indent(depth) + "- " + FormatKey(first_k) + ":");
        AppendArrayItems(first_v.array_value(), depth + 2, lines);
      }
    } else {
      lines.push_back(Indent(depth) + "- " + FormatKey(first_k) + ": " + FormatPrimitive(first_v));
    }

    for (size_t i = 1; i < obj.size(); ++i) {
      const auto& [k, v] = obj[i];
      if (v.type() == JsonNode::Type::kObject) {
        if (v.object_value().empty()) {
          lines.push_back(Indent(depth + 1) + FormatKey(k) + ": {}");
        } else {
          lines.push_back(Indent(depth + 1) + FormatKey(k) + ":");
          AppendObjectFields(v.object_value(), depth + 2, lines);
        }
      } else if (v.type() == JsonNode::Type::kArray) {
        if (v.array_value().empty()) {
          lines.push_back(Indent(depth + 1) + FormatKey(k) + ": []");
        } else {
          lines.push_back(Indent(depth + 1) + FormatKey(k) + ":");
          AppendArrayItems(v.array_value(), depth + 2, lines);
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
    const JsonNode& first = arr[0];
    if (first.type() == JsonNode::Type::kObject) {
      if (first.object_value().empty()) {
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
      const JsonNode& item = arr[i];
      if (item.type() == JsonNode::Type::kObject) {
        if (item.object_value().empty()) {
          lines.push_back(Indent(depth + 1) + "- {}");
        } else {
          AppendObjectAsListItem(item.object_value(), depth + 1, lines);
        }
      } else if (item.type() == JsonNode::Type::kArray) {
        if (item.array_value().empty()) {
          lines.push_back(Indent(depth + 1) + "- []");
        } else {
          AppendArrayAsListItem(item.array_value(), depth + 1, lines);
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
  size_t depth_ = 0;
  static constexpr size_t kMaxDepth = 1000;

  struct DepthGuard {
    size_t& d;
    explicit DepthGuard(size_t& depth) : d(depth) { ++d; }
    ~DepthGuard() { --d; }
  };

  static ParseError Error(const std::string& msg, size_t pos) {
    return ParseError{msg + " at position " + std::to_string(pos)};
  }

  static ParseError Error(std::string msg) { return ParseError{std::move(msg)}; }

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
      return Error("Empty input");
    }
    ParseResult<JsonNode> res = ParseValue();
    if (!res.ok()) {
      return res;
    }
    SkipWhitespace();
    if (pos_ < input_.size()) {
      return Error("Unexpected trailing content after JSON value", pos_);
    }
    return res;
  }

  ParseResult<JsonNode> ParseValue() {
    if (depth_ >= kMaxDepth) {
      return Error("Exceeded maximum nesting depth", pos_);
    }
    DepthGuard guard(depth_);
    SkipWhitespace();
    if (pos_ >= input_.size()) {
      return Error("Unexpected end of input");
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
        return Error(std::string("Unexpected character: '") + c + "'", pos_);
    }
  }

  ParseResult<JsonNode> ParseNull() {
    size_t start = pos_;
    if (pos_ + 4 <= input_.size() && input_.substr(pos_, 4) == "null") {
      pos_ += 4;
      return JsonNode(std::nullopt);
    }
    return Error("Expected 'null'", start);
  }

  ParseResult<JsonNode> ParseTrue() {
    size_t start = pos_;
    if (pos_ + 4 <= input_.size() && input_.substr(pos_, 4) == "true") {
      pos_ += 4;
      return JsonNode(true);
    }
    return Error("Expected 'true'", start);
  }

  ParseResult<JsonNode> ParseFalse() {
    size_t start = pos_;
    if (pos_ + 5 <= input_.size() && input_.substr(pos_, 5) == "false") {
      pos_ += 5;
      return JsonNode(false);
    }
    return Error("Expected 'false'", start);
  }

  ParseResult<JsonNode> ParseNumber() {
    size_t start = pos_;
    if (pos_ < input_.size() && input_[pos_] == '-') {
      ++pos_;
    }
    if (pos_ >= input_.size()) {
      return Error("Expected digit after '-'", start);
    }
    if (input_[pos_] == '0') {
      ++pos_;
      if (pos_ < input_.size() && input_[pos_] >= '0' && input_[pos_] <= '9') {
        return Error("Invalid leading zero in number", start);
      }
    } else if (input_[pos_] >= '1' && input_[pos_] <= '9') {
      while (pos_ < input_.size() && input_[pos_] >= '0' && input_[pos_] <= '9') {
        ++pos_;
      }
    } else {
      return Error("Expected digit for number", start);
    }

    if (pos_ < input_.size() && input_[pos_] == '.') {
      ++pos_;
      if (pos_ >= input_.size() || input_[pos_] < '0' || input_[pos_] > '9') {
        return Error("Expected digit after '.'", start);
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
        return Error("Expected digit for exponent", start);
      }
      while (pos_ < input_.size() && input_[pos_] >= '0' && input_[pos_] <= '9') {
        ++pos_;
      }
    }

    std::string s(input_.substr(start, pos_ - start));
    char* end_ptr = nullptr;
    double val = std::strtod(s.c_str(), &end_ptr);
    if (end_ptr != s.c_str() + s.size()) {
      return Error("Invalid number format", start);
    }
    return JsonNode(val);
  }

  ParseResult<std::string> ParseRawString() {
    size_t start = pos_;
    if (pos_ >= input_.size() || input_[pos_] != '"') {
      return Error("Expected '\"'", start);
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
          return Error("Unterminated escape sequence in string", pos_ - 1);
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
              return Error("Incomplete unicode escape sequence", pos_ - 2);
            }
            uint32_t cp = 0;
            for (int i = 0; i < 4; ++i) {
              int h = HexDigit(input_[pos_++]);
              if (h < 0) {
                return Error("Invalid hex digit in unicode escape", pos_ - 1);
              }
              cp = (cp << 4) | static_cast<uint32_t>(h);
            }
            if (cp >= 0xD800 && cp <= 0xDBFF) {
              if (pos_ + 6 > input_.size() || input_[pos_] != '\\' || input_[pos_ + 1] != 'u') {
                return Error("Expected low surrogate after high surrogate", pos_);
              }
              pos_ += 2;
              uint32_t lo = 0;
              for (int i = 0; i < 4; ++i) {
                int h = HexDigit(input_[pos_++]);
                if (h < 0) {
                  return Error("Invalid hex digit in unicode escape", pos_ - 1);
                }
                lo = (lo << 4) | static_cast<uint32_t>(h);
              }
              if (lo < 0xDC00 || lo > 0xDFFF) {
                return Error("Invalid low surrogate in unicode escape", pos_ - 4);
              }
              cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
            } else if (cp >= 0xDC00 && cp <= 0xDFFF) {
              return Error("Unpaired low surrogate in unicode escape", pos_ - 4);
            }
            AppendUtf8(cp, result);
            break;
          }
          default:
            return Error(std::string("Invalid escape character: '\\") + esc + "'", pos_ - 2);
        }
      } else if (c < 0x20) {
        return Error("Unescaped control character in string", pos_ - 1);
      } else {
        result += static_cast<char>(c);
      }
    }
    return Error("Unterminated string", start);
  }

  ParseResult<JsonNode> ParseStringNode() {
    ParseResult<std::string> str_res = ParseRawString();
    if (!str_res.ok()) {
      return str_res.error();
    }
    return JsonNode(*std::move(str_res));
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
        return Error("Unterminated array", start);
      }
      ParseResult<JsonNode> val_res = ParseValue();
      if (!val_res.ok()) {
        return val_res;
      }
      elements.push_back(*std::move(val_res));

      SkipWhitespace();
      if (pos_ >= input_.size()) {
        return Error("Unterminated array", start);
      }
      char c = input_[pos_++];
      if (c == ']') {
        break;
      } else if (c == ',') {
        SkipWhitespace();
        if (pos_ < input_.size() && input_[pos_] == ']') {
          return Error("Trailing comma in array", pos_ - 1);
        }
      } else {
        return Error(std::string("Expected ',' or ']' in array, got '") + c + "'", pos_ - 1);
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
      return JsonNode(JsonNode::Object{});
    }

    JsonNode::Object entries;
    while (true) {
      SkipWhitespace();
      if (pos_ >= input_.size()) {
        return Error("Unterminated object", start);
      }
      if (input_[pos_] != '"') {
        return Error("Expected string key in object", pos_);
      }
      ParseResult<std::string> key_res = ParseRawString();
      if (!key_res.ok()) {
        return key_res.error();
      }
      std::string key = *std::move(key_res);

      SkipWhitespace();
      if (pos_ >= input_.size() || input_[pos_] != ':') {
        return Error("Expected ':' after key in object", pos_);
      }
      ++pos_;  // consume ':'

      SkipWhitespace();
      ParseResult<JsonNode> val_res = ParseValue();
      if (!val_res.ok()) {
        return val_res;
      }
      entries.emplace_back(std::move(key), *std::move(val_res));

      SkipWhitespace();
      if (pos_ >= input_.size()) {
        return Error("Unterminated object", start);
      }
      char c = input_[pos_++];
      if (c == '}') {
        break;
      } else if (c == ',') {
        SkipWhitespace();
        if (pos_ < input_.size() && input_[pos_] == '}') {
          return Error("Trailing comma in object", pos_ - 1);
        }
      } else {
        return Error(std::string("Expected ',' or '}' in object, got '") + c + "'", pos_ - 1);
      }
    }
    return JsonNode(std::move(entries));
  }
};

class JsonObjectParser {
 public:
  explicit JsonObjectParser(const JsonNode::Object* object) {
    sorted_entries_.reserve(object->size());
    for (const auto& pair : *object) {
      sorted_entries_.push_back(&pair);
    }
    std::sort(sorted_entries_.begin(), sorted_entries_.end(),
              [](const auto& a, const auto& b) { return a->first < b->first; });
  }

  // Parses the value for key into out.
  // Important: Calls to Parse and ParseOptional must be made in alphabetical order of the keys.
  template <typename T>
  void Parse(std::string_view key, T& out) {
    return ParseImpl(key, out, false);
  }

  // Parses the optional value for key into out.
  // Important: Calls to Parse and ParseOptional must be made in alphabetical order of the keys.
  template <typename T>
  void ParseOptional(std::string_view key, T& out) {
    return ParseImpl(key, out, true);
  }

  ParseStatus status() && { return std::move(status_); }
  ParseStatus status() const& = delete;

 private:
  std::vector<const std::pair<std::string, JsonNode>*> sorted_entries_;
  size_t index_ = 0;
  ParseStatus status_ = kOkStatus;

  template <typename T>
  void ParseImpl(std::string_view key, T& out, bool optional) {
    if (!status_.ok()) return;
    while (index_ < sorted_entries_.size()) {
      const auto& entry = *sorted_entries_[index_];
      int cmp_result = key.compare(entry.first);
      if (cmp_result == 0) {
        ++index_;
        status_ = ParseJsonNode(entry.second, out);
        return;
      } else if (cmp_result < 0) {
        // Current entry is greater than key
        break;
      } else {
        // Current entry comes before key; extra/unrequested field, skip it
        ++index_;
      }
    }
    if (!optional) {
      status_ = ParseError(std::format("Missing key: {}", key));
    }
  }
};

}  // namespace internal

inline ParseResult<JsonNode> JsonNode::ParseJson(std::string_view json) {
  return internal::JsonParser::Parse(json);
}

inline std::string JsonNode::ToToon() const { return internal::ToonFormatter::Format(*this); }

inline std::string JsonNode::ToYaml() const { return internal::YamlFormatter::Format(*this); }

}  // namespace typeprompt
