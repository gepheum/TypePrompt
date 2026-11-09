export function registerCustomElement(
  tagName: string,
): (target: CustomElementConstructor) => void {
  return (target: CustomElementConstructor): void => {
    if (typeof customElements !== "undefined" && !customElements.get(tagName)) {
      customElements.define(tagName, target);
    }
  };
}
