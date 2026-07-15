import { isMap, isScalar, LineCounter, parseDocument } from "yaml";

function f() {
  const yamlText = `
  ---
    point: {
        x     :    10,  
        y:      10
    }
    invoice: 34843
    date:     2026-07-15
    bill-to:
      given:   "John"
      family: "Smith"
    product:
      - sku:   "BL394D"
        quantity: 4
        foo: |
          Bonjour
          ça va ?
        description: "Basketball\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo"
    `;

  // 1. Initialize a LineCounter to track lines/columns
  const lineCounter = new LineCounter();

  // 2. Parse into an AST Document
  const doc = parseDocument(yamlText, { lineCounter });

  // 3. (Optional) Convert the entire document to standard JSON
  const jsonOutput = doc.toJSON();
  console.log("JSON Output:", JSON.stringify(jsonOutput, null, 2));

  // 4. Retrieve offsets for specific keys or nodes
  // Find the 'x' key inside 'point'
  const pointNode = doc.get("point", true);

  if (isMap(pointNode)) {
    // Iterate items to find the pair whose key is 'x'
    const xPair = pointNode.items.find(
      (pair) => isScalar(pair.key) && pair.key.value === "x",
    );

    if (xPair) {
      const valueNode = xPair.value;

      // Each AST node contains a .range property: [start, value-end, node-end]
      if (isScalar(valueNode) && valueNode.range) {
        const [startOffset, valueEndOffset] = valueNode.range;

        // Translate the character offset to { line, col } (both 1-indexed)
        const position = lineCounter.linePos(startOffset);

        console.log(`\n--- Node Position Metadata ---`);
        console.log(`Key: "x"`);
        console.log(`Parsed Value: "${valueNode.value}"`);
        console.log(`Character Start Offset: ${startOffset}`);
        console.log(`Character End Offset: ${valueEndOffset}`);
        console.log(
          `Original Source Location: Line ${position.line}, Column ${position.col}`,
        );
      }
    }
  }
}

f();
