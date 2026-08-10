import pydantic
import dataclasses
import json
from collections.abc import Sequence

from typing import Any, Final, Generic, TypeVar, Literal


@dataclasses.dataclass(frozen=True)
class Prompt[Input, Output]:
    system_message: str
    user_message: str
    template_id: str


@dataclasses.dataclass(frozen=True)
class FewShotExample:
    user_message: str
    intermediate_steps: Sequence["IntermediateStepExample"];
    response: str


@dataclasses.dataclass(frozen=True)
class IntermediateStepExample:
  # Tool calls made in parallel at this step.
  tool_calls: Sequence["ToolCallExample"]


@dataclasses.dataclass(frozen=True)
class ToolCallExample:
    call_id: str
    tool_name: str
    # Stringified JSON input
    stringified_input: str
    # Stringified JSON output
    stringified_output: str

