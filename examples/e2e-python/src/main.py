"""TypePrompt End-to-End Python Example with Anthropic Claude SDK.

Demonstrates using TypePrompt prompt templates with typed tool execution
and structured JSON output using Anthropic's Claude messages API.
"""

import asyncio
import json
import os
import sys
from collections.abc import Mapping

import anthropic
from anthropic import AsyncAnthropic, omit
from anthropic.types import MessageParam, ToolParam

from gen.prompts import Prompt, ToolCall, prompts, schema


class WeatherExecutor:
    """Implements the getWeather tool declared in prompts/getWeather.tp."""

    _SAMPLE_FORECASTS: Mapping[str, schema.get_weather.Output] = {
        "seattle": schema.get_weather.Output(
            temperature_c=13,
            condition="light drizzle",
            forecast="Cool and drizzly with overcast skies. Cozy indoor spots recommended.",
        ),
        "paris": schema.get_weather.Output(
            temperature_c=18,
            condition="partly cloudy",
            forecast="Pleasant afternoon breeze, perfect for walking along the Seine.",
        ),
        "tokyo": schema.get_weather.Output(
            temperature_c=22,
            condition="sunny and clear",
            forecast="Bright blue skies and warm afternoon sunshine throughout the city.",
        ),
        "london": schema.get_weather.Output(
            temperature_c=15,
            condition="foggy morning clearing to sun",
            forecast="Chilly morning turning mild and pleasant in the afternoon.",
        ),
        "new york": schema.get_weather.Output(
            temperature_c=21,
            condition="breezy and sunny",
            forecast="Great outdoor weather for Central Park or exploring neighborhood cafes.",
        ),
    }

    async def get_weather(
        self, input: schema.get_weather.Input
    ) -> schema.get_weather.Output:
        """Called automatically when Claude invokes the getWeather tool."""
        print(f"  [Tool Executed] getWeather(city='{input.city}')")
        key = input.city.strip().lower()
        return self._SAMPLE_FORECASTS.get(
            key,
            schema.get_weather.Output(
                temperature_c=20,
                condition="mild and clear",
                forecast=f"Favorable conditions expected throughout {input.city}.",
            ),
        )


async def execute_prompt[Output, ToolExecutor](
    client: AsyncAnthropic,
    prompt: Prompt[Output, ToolExecutor],
    tool_executor: ToolExecutor,
) -> Output:
    """Generic helper to execute any TypePrompt prompt with Anthropic Claude."""
    # 1. Convert TypePrompt tool definitions into Anthropic's tool format
    tools_list: list[ToolParam] = [
        {
            "name": t.name,
            "description": t.description,
            "input_schema": t.input_json_schema,
        }
        for t in prompt.tools.values()
    ]

    # 2. Format initial conversation messages (few-shot examples + user prompt)
    messages: list[MessageParam] = [
        *(
            msg
            for ex in prompt.examples
            for msg in [
                MessageParam(role="user", content=ex.user_message),
                MessageParam(role="assistant", content=ex.response),
            ]
        ),
        {"role": "user", "content": prompt.user_message},
    ]

    # 3. Conversational tool execution loop
    while True:
        response = await client.messages.create(
            model=getattr(prompt.meta, "model", None) or "claude-3-7-sonnet-latest",
            max_tokens=1024,
            system=prompt.system_message,
            messages=messages,
            tools=tools_list if tools_list else omit,
        )

        messages.append({"role": "assistant", "content": response.content})

        # Check if Claude requested any tool calls
        tool_use_blocks = [
            block for block in response.content if block.type == "tool_use"
        ]

        if tool_use_blocks:
            tool_calls_to_execute = [
                ToolCall(
                    call_id=block.id,
                    tool_name=block.name,
                    stringified_input=json.dumps(block.input),
                )
                for block in tool_use_blocks
            ]

            # Execute tool calls concurrently using TypePrompt's execute_tools
            tool_results = await prompt.execute_tools(
                tool_calls_to_execute, tool_executor
            )

            # Send tool results back to Claude
            messages.append(
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": res.call_id,
                            "content": res.stringified_output,
                            "is_error": res.error is not None,
                        }
                        for res in tool_results
                    ],
                }
            )
            continue

        # Extract text response and parse/validate into typed Output model with TypePrompt
        text_content = "".join(
            block.text for block in response.content if block.type == "text"
        )
        return prompt.parse_response(text_content)


async def main() -> None:
    city = sys.argv[1] if len(sys.argv) > 1 else "Seattle"
    interests = (
        sys.argv[2] if len(sys.argv) > 2 else "cozy indie bookstores and artisan coffee"
    )

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print(
            "Error: ANTHROPIC_API_KEY environment variable is not set.", file=sys.stderr
        )
        print(
            "Please set ANTHROPIC_API_KEY to run against Anthropic Claude.\n",
            file=sys.stderr,
        )
        print("Usage:", file=sys.stderr)
        print('  export ANTHROPIC_API_KEY="sk-ant-..."', file=sys.stderr)
        print(f'  python src/main.py "{city}" "{interests}"', file=sys.stderr)
        sys.exit(1)

    client = AsyncAnthropic(api_key=api_key)

    print(f"Planning a day in '{city}' tailored to: '{interests}'...\n")

    # 1. Render the typed prompt
    prompt = prompts.plan_day.render(
        schema.plan_day.Input(
            city=city,
            interests=interests,
        )
    )

    # 2. Execute the prompt with Claude and the typed tool executor
    plan = await execute_prompt(client, prompt, WeatherExecutor())

    print("\n--- Structured Day Plan ---")
    print(f"Destination: {plan.city}")
    print(f"Weather: {plan.weather_summary}")
    print(f"Packing Tip: {plan.packing_tip}\n")
    print("Recommended Activities:")
    for act in plan.activities:
        indoor_badge = "[Indoor]" if act.indoor else "[Outdoor]"
        print(f"  • ({act.time_of_day.capitalize()}) {act.title} {indoor_badge}")
        print(f"    {act.description}")


if __name__ == "__main__":
    asyncio.run(main())
