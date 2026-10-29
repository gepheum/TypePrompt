export {
  getCompletionItems,
  getYamlCompletionItems,
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

export {
  getPositionContext,
  type PositionCommentContext,
  type PositionContext,
} from "./position-context.js";

export { tokenize, type SemanticToken } from "./semantic-token.js";
