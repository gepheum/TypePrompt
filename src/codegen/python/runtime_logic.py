from pydantic import BaseModel
from dataclasses import dataclass
from collections.abc import Sequence

from typing import Literal, final, overload

import pydantic


# <generated>
@final
class schema:
  class meta:
    class Meta(BaseModel):
      temperature: float
# </generated>


# <static:python-public-types>
@dataclass(frozen=True)
class Prompt[Output]:
  meta: schema.meta.Meta
  system_message: str
  user_message: str
  template_id: str
  examples: Sequence["FewShotExample"]
  output_format: OutputFormat[Output]


@dataclass(frozen=True)
class FewShotExample:
  user_message: str
  intermediate_steps: Sequence["IntermediateStepExample"];
  response: str


@dataclass(frozen=True)
class IntermediateStepExample:
  # Tool calls made in parallel at this step.
  tool_calls: Sequence["ToolCallExample"]


@dataclass(frozen=True)
class ToolCallExample:
  call_id: str
  tool_name: str
  # Stringified JSON input
  stringified_input: str
  # Stringified JSON output
  stringified_output: str


@dataclass(frozen=True)
class JsonOutputFormat[Output]:
  format: Literal["json"]
  type_adapter: pydantic.TypeAdapter[Output]


@dataclass(frozen=True)
class TextOutputFormat:
  format: Literal["text"]


type OutputFormat[Output] = JsonOutputFormat[Output] | TextOutputFormat
# </static:python-public-types>
