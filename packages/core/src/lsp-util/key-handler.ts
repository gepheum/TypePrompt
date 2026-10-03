export function onKeyDown(
  _key: ">",
  _xmlContent: string,
  _position: number,
):
  | {
      readonly action: "none";
    }
  | {
      readonly action: "insert-after";
      readonly text: string;
    } {
  return { action: "none" };
}
