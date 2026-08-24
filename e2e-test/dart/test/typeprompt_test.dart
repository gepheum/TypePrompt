import 'package:test/test.dart';
import 'package:typeprompt_e2e_test/typeprompt_e2e_test.dart';

void main() {
  test('greeting', () {
    expect(getGreeting(), equals('Hello, World!'));
  });
}
