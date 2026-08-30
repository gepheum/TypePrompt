import 'dart:convert';
import 'package:test/test.dart';
import 'package:typeprompt_e2e_test/gen/prompts_e01.dart';
import 'package:typeprompt_e2e_test/typeprompt_e2e_test.dart';

void main() {
  test('greeting', () {
    expect(getGreeting(), equals('Hello, World!'));
  });

  group('toString', () {
    test('returns pretty-printed JSON', () {
      final add = Shared_Expr_KindAdd(
        left: Shared_Expr_KindNumber(value: 1.0),
        right: Shared_Expr_KindNumber(value: 2.0),
      );
      final expectedJson = JsonEncoder.withIndent('  ').convert(add.toJson());
      expect(add.toString(), equals(expectedJson));
      expect(
        add.toString(),
        equals('{\n'
            '  "kind": "add",\n'
            '  "left": {\n'
            '    "kind": "number",\n'
            '    "value": 1.0\n'
            '  },\n'
            '  "right": {\n'
            '    "kind": "number",\n'
            '    "value": 2.0\n'
            '  }\n'
            '}'),
      );
    });
  });
}
