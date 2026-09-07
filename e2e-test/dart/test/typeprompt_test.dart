import 'dart:convert';
import 'package:test/test.dart';
import 'package:typeprompt_e2e_test/gen/prompts_01.dart' as p01;
import 'package:typeprompt_e2e_test/gen/prompts_02.dart' as p02;
import 'package:typeprompt_e2e_test/gen/prompts_03.dart' as p03;
import 'package:typeprompt_e2e_test/gen/prompts_04.dart' as p04;
import 'package:typeprompt_e2e_test/gen/prompts_05.dart' as p05;
import 'package:typeprompt_e2e_test/gen/prompts_06.dart' as p06;
import 'package:typeprompt_e2e_test/gen/prompts_07.dart' as p07;
import 'package:typeprompt_e2e_test/gen/prompts_08.dart' as p08;
import 'package:typeprompt_e2e_test/gen/prompts_e01.dart';
import 'package:typeprompt_e2e_test/gen/prompts_e02.dart' as e02;
import 'package:typeprompt_e2e_test/gen/prompts_e03.dart' as e03;

void main() {
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

  test('construct without optional fields', () {
    final matrix = Shared_Matrix(
      matrix: [],
      ints: [1, 2, 3],
      init: true,
      encode: false,
    );
    expect(matrix.otherMatrix, isNull);
    expect(matrix.foo, isNull);
  });

  test('EnumWithCommonFields serialization & deserialization', () {
    final notSuccess = Shared_EnumWithCommonFields_NotSuccess(
      x: 10,
      y: 20.5,
      z: "error",
    );
    expect(notSuccess.x, equals(10));
    expect(notSuccess.y, equals(20.5));
    expect(notSuccess.z, equals("error"));
    final jsonNotSuccess = notSuccess.toJson();
    expect(jsonNotSuccess["success"], isFalse);
    expect(jsonNotSuccess["x"], equals(10));
    expect(jsonNotSuccess["y"], equals(20.5));
    expect(jsonNotSuccess["z"], equals("error"));
    final decodedNotSuccess =
        Shared_EnumWithCommonFields.fromJson(jsonNotSuccess);
    expect(decodedNotSuccess.x, equals(10));
    expect(decodedNotSuccess.y, equals(20.5));

    final success = Shared_EnumWithCommonFields_Success(
      x: 42,
      y: 84.0,
      z: 99,
    );
    expect(success.x, equals(42));
    expect(success.y, equals(84.0));
    expect(success.z, equals(99));
    final jsonSuccess = success.toJson();
    expect(jsonSuccess["success"], isTrue);
    expect(jsonSuccess["x"], equals(42));
    expect(jsonSuccess["y"], equals(84.0));
    expect(jsonSuccess["z"], equals(99));
    final decodedSuccess = Shared_EnumWithCommonFields.fromJson(jsonSuccess);
    expect(decodedSuccess.x, equals(42));
    expect(decodedSuccess.y, equals(84.0));
  });

  test('string enum serialization & deserialization', () {
    final variant = AnalyzeSalesData_Input_Variant.csv;
    expect(variant.toJson(), equals("csv"));
    expect(AnalyzeSalesData_Input_Variant.fromJson("csv"),
        equals(AnalyzeSalesData_Input_Variant.csv));
  });

  [
    p01.FewShotExample,
    p02.FewShotExample,
    p03.FewShotExample,
    p04.FewShotExample,
    p05.FewShotExample,
    p06.FewShotExample,
    p07.FewShotExample,
    p08.FewShotExample,
    e02.FewShotExample,
    e03.FewShotExample,
    p01.Prompts,
    p08.Prompts,
  ];
}
