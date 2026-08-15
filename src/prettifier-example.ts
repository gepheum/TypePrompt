// import * as prettier from "prettier";

// async function formatYAML() {
//   // A messy, unformatted YAML string
//   const messyYaml = `
// ---
//   point: {
//       x     :    10,  
//       y:      10
//   }
//   invoice: 34843
//   date:     2026-07-15
//   bill-to:
//     given:   "John"
//     family: "Smith"
//   product:
//     - sku:   "BL394D"
//       quantity: 4
//       foo: |
//         Bonjour
//         ça va ?
//       description: "Basketball\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo\\nFoo"
//   `;

//   try {
//     // Call the format function specifying the "yaml" parser
//     const formattedYaml = await prettier.format(messyYaml, {
//       parser: "yaml", // Enforces the YAML parser
//       tabWidth: 2, // Sets standard YAML indentation
//       singleQuote: false, // Sets quoting preference
//     });

//     console.log("--- Formatted YAML ---");
//     console.log(formattedYaml);
//   } catch (error) {
//     console.error("Failed to format YAML:", error);
//   }
// }

// async function formatTypescript() {
//   // A messy, unformatted TypeScript snippet
//   const messyTs = `
//     type Foo = {
//       x: string;
//       y  : string;
//       z  :integer;
//     }

//     type Variant =
    
//     "a" | "b" | "cchhh" | "cchhh" | "cchhh" | "cchhh" | "b" | "cchhh" | "cchhh" | "cchhh" | "cchhh" | "b" | "cchhh" | "cchhh" | "cchhh" | "cchhh"
//     type Joo = |{kind: string; foo: string;}|{kind: string; foo: string;}|{kind: string; foo: string;}|{kind: string; foo: string;}
//   `;

//   try {
//     const formattedTs = await prettier.format(messyTs, {
//       parser: "typescript",
//       tabWidth: 2,
//       singleQuote: false,
//       semi: true,
//       trailingComma: "all",
//     });

//     console.log("--- Formatted TypeScript ---");
//     console.log(formattedTs);
//   } catch (error) {
//     console.error("Failed to format TypeScript:", error);
//   }
// }

// // formatYAML();
// formatTypescript();
