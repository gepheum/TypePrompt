export {
  getCompletionItems,
  getConfigCompletionItems,
} from "./completion-provider.js";

export {
  computeBackspaceAction,
  computeEnterAction,
  computeToggleComment,
  getAutoCloseCommentAction,
  getAutoCloseTagAction,
  getCommentTypeAtPosition,
} from "./editor-actions.js";

export { getElementContentFormat } from "./element-content-format.js";

export { tokenize, type SemanticToken } from "./semantic-token.js";
