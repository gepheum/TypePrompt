#pragma once

#include <cmath>
#include <cstddef>
#include <limits>
#include <memory>
#include <optional>
#include <string>
#include <type_traits>
#include <utility>
#include <variant>
#include <vector>

namespace typeprompt {

namespace internal {
static constexpr char kHexDigits[] = "0123456789ABCDEF";
}  // namespace internal

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
  explicit JsonNode(const std::string& value) : data_(NormalizeUtf8(value)) {}
  explicit JsonNode(std::vector<JsonNode> value) : data_(std::move(value)) {}
  explicit JsonNode(std::vector<std::pair<std::string, JsonNode>> value)
      : data_(std::move(value)) {}

  JsonNode(const JsonNode&) = default;
  JsonNode(JsonNode&&) = default;

  JsonNode& operator=(const JsonNode&) = default;
  JsonNode& operator=(JsonNode&&) = default;

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

  std::string Stringify() const {
    std::string json;
    std::string eolIndent;
    AppendJson(json, eolIndent);
    return json;
  }

  std::string StringifyWithIndent() const {
    std::string json;
    std::string eolIndent = "\n";
    AppendJson(json, eolIndent);
    return json;
  }

 private:
  using JsonArrayVariant = std::vector<JsonNode>;
  using JsonObjectVariant = std::vector<std::pair<std::string, JsonNode>>;

  std::variant<std::nullopt_t, bool, double, std::string, JsonArrayVariant, JsonObjectVariant>
      data_;

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

  static std::string NormalizeUtf8(const std::string& input) {
    std::string out;
    out.reserve(input.size());
    const char* input_pos = input.c_str();
    const char* input_end = input_pos + input.length();
    while (true) {
      const int8_t c = static_cast<int8_t>(*(input_pos++));
      if (c <= 0) {
        if (c == 0) {
          // The input string is guaranteed to end with \0, but \0 can also be
          // found within the string.
          if (input_pos > input_end) {
            break;
          } else {
            out += '\0';
          }
        } else {
          CopyUtf8Codepoint(c, input_pos, input_end, out);
        }
      } else {
        out += c;
      }
    }
    return out;
  }

  static void CopyUtf8Codepoint(uint8_t first_byte, const char*& pos, const char* end,
                                std::string& out) {
    // Push byte and all the continuation bytes that follow. If the input
    // string happens to not be a well-formed UTF-8 string, we'll remove the
    // chars we have pushed.
    out += first_byte;

    // Total number of continuation bytes actually read.
    size_t continuation_bytes = 0;

    // From https://github.com/chansen/c-utf8-valid/blob/master/utf8_valid.h
    uint32_t v = first_byte;

    for (;;) {
      const uint8_t continuation_byte = static_cast<uint8_t>(*pos);
      if ((continuation_byte & 0xC0) == 0x80) {
        out += continuation_byte;
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
    // Push the replacement character: � (u+FFFD)
    out += "�";
  }

  static void AppendJsonString(const std::string& value, std::string& out) {
    out += '"';
    const char* pos = value.data();
    const char* const end = pos + value.size();
    while (true) {
      const uint8_t byte = static_cast<uint8_t>(*pos++);
      if (byte < 0x20) {
        // A non-printable character.
        switch (byte) {
          case '\0':
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
          case '\b':
            out += {'\\', 'b'};
            break;
          case '\f':
            out += {'\\', 'f'};
            break;
          case '\n':
            out += {'\\', 'n'};
            break;
          case '\r':
            out += {'\\', 'r'};
            break;
          case '\t':
            out += {'\\', 't'};
            break;
          default:
            out += {'\\',
                    'u',
                    '0',
                    '0',
                    internal::kHexDigits[(byte >> 4) & 0x0F],
                    internal::kHexDigits[byte & 0x0F]};
        }
      } else {
        // A printable character.
        switch (byte) {
          case '"':
            out += {'\\', '"'};
            break;
          case '\\':
            out += {'\\', '\\'};
            break;
          default:
            out += byte;
        }
      }
    }
  }
};

}  // namespace typeprompt
