import sys
import os
import pytest

sys.path.insert(0, os.path.dirname(__file__))

from gen.prompt_maker_p1 import (
    PromptMaker,
    schema,
    tools,
)

prompt_maker = PromptMaker()
prompt = prompt_maker.get_template("Main:MyTemplate").make(
    schema.main.my_template.Input(
        first_name="John",
        last_name="Doe",
    )
)


class TestMeta:
    def test_is_populated_from_the_template_content(self):
        assert prompt.meta == {"temperature": 0.7, "foobar": "bar"}


class TestSystemMessage:
    def test_resolves_snippet_references_and_concatenates_text_pieces(self):
        assert prompt.system_message == (
            "Hello,\n\n\nHow many characters are in your full name?"
        )


class TestUserMessage:
    def test_interpolates_input_properties_into_text_pieces(self):
        assert prompt.user_message == "\n".join(
            [
                "Your firstName is: John",
                "Your lastName is: Doe",
                "",
                'For example {"firstName": "Bo", "lastName": "Zo"}',
            ]
        )


class TestTools:
    def test_exposes_my_tool_with_correct_name_and_description(self):
        tool = prompt.tools["myTool"]
        assert tool.name == "myTool"
        assert tool.description == "A tool that does something"


class TestOutputFormat:
    def test_reflects_the_output_format_declared_in_the_template(self):
        assert prompt.output_format.format == "json"


class TestParseResponse:
    def test_parses_json_object(self):
        assert prompt.parse_response('{ "x" : 42 }') == schema.main.my_template.Output(x=42)

    def test_strips_plain_code_fences(self):
        assert prompt.parse_response('```\n{ "x" : 42 }\n```') == schema.main.my_template.Output(x=42)

    def test_strips_json_code_fences(self):
        assert prompt.parse_response('```json\n{ "x" : 42 }\n```') == schema.main.my_template.Output(x=42)


class TestExamples:
    def test_produces_one_example_per_entry_in_the_template_data(self):
        assert len(prompt.examples) == 2

    def test_resolves_each_example_user_message_from_the_input(self):
        assert prompt.examples[0].user_message == "\n".join(
            [
                "Your firstName is: John",
                "Your lastName is: Doe",
                "",
                'For example {"firstName": "Bo", "lastName": "Zo"}',
            ]
        )
        assert prompt.examples[1].user_message == "\n".join(
            [
                "Your firstName is: Jane",
                "Your lastName is: Smith",
                "",
                'For example {"firstName": "Bo", "lastName": "Zo"}',
            ]
        )

    def test_resolves_intermediate_tool_call_steps_with_stringified_io(self):
        steps = prompt.examples[0].intermediate_steps
        assert len(steps) == 1
        assert steps[0].tool_calls[0].call_id == "myCall"
        assert steps[0].tool_calls[0].tool_name == "myTool"
        assert steps[0].tool_calls[0].stringified_input == '{"foo": "hello"}'
        assert steps[0].tool_calls[0].stringified_output == '{"bar": "world"}'

    def test_produces_empty_intermediate_steps_when_there_are_none(self):
        assert prompt.examples[1].intermediate_steps == []


class TestCallTools:
    class _Impls:
        async def my_tool(
            self, input: schema.main.my_tool.Input
        ) -> schema.main.my_tool.Output:
            return schema.main.my_tool.Output(bar=input.foo.upper())

    @pytest.mark.asyncio
    async def test_calls_the_impl_and_returns_stringified_output(self):
        result = await prompt.call_tools(
            [
                type("ToolCall", (), {
                    "call_id": "c1",
                    "tool_name": "myTool",
                    "stringified_input": '{"foo":"hello"}',
                })()
            ],
            self._Impls(),
        )
        assert len(result) == 1
        assert result[0].call_id == "c1"
        assert result[0].stringified_output == '{"bar":"HELLO"}'

    @pytest.mark.asyncio
    async def test_throws_when_tool_name_is_not_registered(self):
        with pytest.raises(Exception):
            await prompt.call_tools(
                [
                    type("ToolCall", (), {
                        "call_id": "c1",
                        "tool_name": "noSuchTool",
                        "stringified_input": "{}",
                    })()
                ],
                self._Impls(),
            )
