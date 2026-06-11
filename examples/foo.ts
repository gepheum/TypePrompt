import { devHandler, PromptMaker } from "./prompts.gen";

interface Foo<T> {
  foo: (a: string) => T;
  bar: any;
}

function f<T>(foo: Foo<T>, t: T): void {
}

function main() {
  f(devHandler, new PromptMaker);
}