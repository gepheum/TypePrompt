import 'dart:convert';
import 'package:test/test.dart';
import 'package:typeprompt_e2e_test/gen/prompts_e01.dart';
import 'package:typeprompt_e2e_test/typeprompt_e2e_test.dart';

void main() {
  test('greeting', () {
    expect(getGreeting(), equals('Hello, World!'));
  });

  group('copyWith', () {
    test('copies with updated field', () {
      final num1 = Shared_Expr_KindNumber(value: 42.0);
      final num2 = num1.copyWith(value: 100.0);
      expect(num2.value, equals(100.0));
      expect(num1.value, equals(42.0));
    });

    test('copies without changing fields when omitted', () {
      final add = Shared_Expr_KindAdd(
        left: Shared_Expr_KindNumber(value: 1.0),
        right: Shared_Expr_KindNumber(value: 2.0),
      );
      final addCopy = add.copyWith(
        right: Shared_Expr_KindNumber(value: 5.0),
      );
      expect((addCopy.left as Shared_Expr_KindNumber).value, equals(1.0));
      expect((addCopy.right as Shared_Expr_KindNumber).value, equals(5.0));
    });

    test('copies 0-field class', () {
      final str = Shared_String();
      final strCopy = str.copyWith();
      expect(strCopy, isA<Shared_String>());
    });
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
