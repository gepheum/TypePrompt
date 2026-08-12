# <static:python-public-types>
from dataclasses import dataclass
from collections.abc import Sequence

from typing import Annotated, Any, Literal, Never, Optional, Union, final, overload

import pydantic


@dataclass(frozen=True)
class Prompt[Output]:
  meta: schema.meta.Meta
  system_message: str
  user_message: str
  template_id: 'TemplateId'
  examples: Sequence['FewShotExample']
  output_format: OutputFormat[Output]


@dataclass(frozen=True)
class FewShotExample:
  user_message: str
  intermediate_steps: Sequence['IntermediateStepExample'];
  response: str


@dataclass(frozen=True)
class IntermediateStepExample:
  # Tool calls made in parallel at this step.
  tool_calls: Sequence['ToolCallExample']


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
  format: Literal['json']
  type_adapter: pydantic.TypeAdapter[Output]


@dataclass(frozen=True)
class TextOutputFormat:
  format: Literal['text']


type OutputFormat[Output] = JsonOutputFormat[Output] | TextOutputFormat
# </static:python-public-types>


# <generated>
# Uniquely identifies a prompt template.
type TemplateId = Literal[
  'Main:MyTemplate',
]


@final
class schema:
  class meta:
    class Meta(pydantic.BaseModel):
      temperature: float
# </generated>
