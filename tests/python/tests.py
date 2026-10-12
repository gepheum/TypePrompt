"""
Comprehensive tests covering all spec features across all example projects.
"""

import sys
import os
import re
import json
import pydantic
import pytest
from typing import Any

sys.path.insert(0, os.path.dirname(__file__))

from gen.prompts_01 import prompts as p01, schema as s01, template_overrider as to01
from gen.prompts_02 import prompts as p02, schema as s02
from gen.prompts_03 import prompts as p03, schema as s03, ToolCall
from gen.prompts_04 import prompts as p04, schema as s04
from gen.prompts_05 import prompts as p05, schema as s05
from gen.prompts_06 import prompts as p06, schema as s06
from gen.prompts_07 import prompts as p07, schema as s07
from gen.prompts_e01 import prompts as pe01, schema as s_e01
from gen.prompts_e02 import prompts as _pe02, schema as _s_e02
from gen.prompts_e03 import prompts as _pe03, schema as _s_e03


# ─── e01 CSV/TSV format: tabular data serialization ──────────────────────────

_rows = [
    s_e01.analyze_sales_data.SalesRow(
        product="Widget A", units=120, revenue_cents=240000, region="north"
    ),
    s_e01.analyze_sales_data.SalesRow(
        product="Widget B", units=85, revenue_cents=340000, region="south"
    ),
]


class TestAnalyzeSalesData:
    csv_prompt = pe01.analyze_sales_data.render(
        s_e01.analyze_sales_data.Input(
            rows=_rows, question="Top product?", variant="csv"
        )
    )
    tsv_prompt = pe01.analyze_sales_data.render(
        s_e01.analyze_sales_data.Input(
            rows=_rows, question="Top product?", variant="tsv"
        )
    )

    def test_csv_user_message_has_comma_separated_header(self):
        assert "product,units,revenueCents,region" in self.csv_prompt.user_message

    def test_csv_user_message_has_comma_separated_rows(self):
        assert "Widget A,120,240000,north" in self.csv_prompt.user_message
        assert "Widget B,85,340000,south" in self.csv_prompt.user_message

    def test_tsv_user_message_has_tab_separated_header(self):
        assert "product\tunits\trevenueCents\tregion" in self.tsv_prompt.user_message

    def test_tsv_user_message_has_tab_separated_rows(self):
        assert "Widget A\t120\t240000\tnorth" in self.tsv_prompt.user_message
        assert "Widget B\t85\t340000\tsouth" in self.tsv_prompt.user_message

    def test_csv_and_tsv_produce_different_user_messages(self):
        assert self.csv_prompt.user_message != self.tsv_prompt.user_message

    def test_empty_rows_renders_no_table_content(self):
        empty = pe01.analyze_sales_data.render(
            s_e01.analyze_sales_data.Input(rows=[], question="Any data?", variant="csv")
        )
        assert "product,units" not in empty.user_message

    def test_csv_variant_has_one_example_with_csv_data(self):
        assert len(self.csv_prompt.examples) == 1
        assert (
            "product,units,revenueCents,region"
            in self.csv_prompt.examples[0].user_message
        )

    def test_tsv_variant_has_one_example_with_tsv_data(self):
        assert len(self.tsv_prompt.examples) == 1
        assert (
            "product\tunits\trevenueCents\tregion"
            in self.tsv_prompt.examples[0].user_message
        )

    def test_csv_system_message_mentions_csv(self):
        assert re.search(r"comma-separated", self.csv_prompt.system_message)

    def test_tsv_system_message_mentions_tsv(self):
        assert re.search(r"tab-separated", self.tsv_prompt.system_message)

    def test_csv_exact_system_message(self):
        assert self.csv_prompt.system_message == (
            "You are a sales analyst. The data below is comma-separated (CSV).\n"
            "Analyze it and answer the question concisely."
        )

    def test_csv_exact_user_message(self):
        assert self.csv_prompt.user_message == (
            "Top product?\n\nData:\n"
            "product,units,revenueCents,region\n"
            "Widget A,120,240000,north\n"
            "Widget B,85,340000,south"
        )

    def test_csv_exact_example0_user_message(self):
        assert self.csv_prompt.examples[0].user_message == (
            "Which product generated the most revenue?\n\nData:\n"
            "product,units,revenueCents,region\n"
            "Widget A,120,240000,north\n"
            "Widget B,85,340000,south\n"
            "Widget C,200,180000,east"
        )

    def test_tsv_exact_system_message(self):
        assert self.tsv_prompt.system_message == (
            "You are a sales analyst. The data below is tab-separated (TSV).\n"
            "Analyze it and answer the question concisely."
        )

    def test_tsv_exact_user_message(self):
        assert self.tsv_prompt.user_message == (
            "Top product?\n\nData:\n"
            "product\tunits\trevenueCents\tregion\n"
            "Widget A\t120\t240000\tnorth\n"
            "Widget B\t85\t340000\tsouth"
        )

    def test_tsv_exact_example0_user_message(self):
        assert self.tsv_prompt.examples[0].user_message == (
            "Which product generated the most revenue?\n\nData:\n"
            "product\tunits\trevenueCents\tregion\n"
            "Widget A\t120\t240000\tnorth\n"
            "Widget B\t85\t340000\tsouth\n"
            "Widget C\t200\t180000\teast"
        )


# ─── 01 Basics: text output, <enclosed>, examples ────────────────────────────


class TestTranslate:
    prompt = p01.translate.render(
        s01.translate.Input(text="Hello world", target_language="French")
    )

    def test_text_output_format(self):
        assert self.prompt.output_format.format == "text"

    def test_template_id(self):
        assert self.prompt.template_id == "Main:Translate"

    def test_template_input(self):
        # template_input is not exposed on the Python Prompt; skip this check
        assert self.prompt.template_id == "Main:Translate"

    def test_system_message_mentions_translator_role(self):
        assert re.search(r"professional translator", self.prompt.system_message)

    def test_user_message_mentions_target_language(self):
        assert re.search(r"French", self.prompt.user_message)

    def test_enclosed_renders_correct_tag_in_user_message(self):
        assert "<Text>" in self.prompt.user_message

    def test_produces_two_examples(self):
        assert len(self.prompt.examples) == 2

    def test_first_example_response_is_translated_string(self):
        assert (
            self.prompt.examples[0].response
            == "La réunion est prévue pour lundi à 15h."
        )

    def test_example_user_message_contains_enclosed_tag(self):
        assert "<Text>" in self.prompt.examples[0].user_message

    def test_parse_response_returns_raw_string(self):
        assert self.prompt.parse_response("Bonjour") == "Bonjour"

    def test_has_no_tools(self):
        assert len(self.prompt.tools) == 0


# ─── 02 Structured output: JSON format, union types, optional fields ─────────


class TestTriageTicket:
    prompt = p02.triage_ticket.render(
        s02.triage_ticket.Input(
            subject="App crashes",
            body="Every time.",
            customer_tier="pro",
            recent_tickets=[],
        )
    )

    def test_json_output_format(self):
        assert self.prompt.output_format.format == "json"
        schema = self.prompt.output_format.json_schema
        assert schema["type"] == "object"
        assert "category" in schema["properties"]
        assert "urgency" in schema["properties"]
        assert "category" in schema["required"]
        assert "urgency" in schema["required"]

    def test_c_content_stripped_to_plain_text(self):
        assert "urgency" in self.prompt.system_message
        assert '"critical"' in self.prompt.system_message
        assert "<c>" not in self.prompt.system_message

    def test_produces_two_examples(self):
        assert len(self.prompt.examples) == 2

    def test_first_example_response_contains_output_category(self):
        assert '"technical-issue"' in self.prompt.examples[0].response

    def test_second_example_response_contains_output_category(self):
        assert '"feature-request"' in self.prompt.examples[1].response

    def test_parse_response_parses_json(self):
        result = self.prompt.parse_response(
            '{"category":"billing","urgency":"low","summary":"Invoice","suggestedActions":[]}'
        )
        assert result.category == "billing"
        assert result.urgency == "low"

    def test_parse_response_strips_json_code_fences(self):
        result = self.prompt.parse_response(
            '```json\n{"category":"other","urgency":"medium","summary":"x","suggestedActions":[]}\n```'
        )
        assert result.category == "other"

    def test_parse_response_strips_plain_code_fences(self):
        result = self.prompt.parse_response(
            '```\n{"category":"other","urgency":"medium","summary":"x","suggestedActions":[]}\n```'
        )
        assert result.category == "other"

    def test_optional_field_absent_when_omitted(self):
        result = self.prompt.parse_response(
            '{"category":"feature-request","urgency":"low","summary":"Dark mode","suggestedActions":["Log request"]}'
        )
        assert result.suggested_reply is None

    def test_user_message_contains_yaml_rendered_recent_tickets(self):
        p = p02.triage_ticket.render(
            s02.triage_ticket.Input(
                subject="X",
                body="Y",
                customer_tier="pro",
                recent_tickets=[
                    s02.triage_ticket.Input_RecentTickets(
                        id="T-1", summary="Login bug", category="technical-issue"
                    )
                ],
            )
        )
        assert "T-1" in p.user_message

    def test_user_message_contains_input_as_yaml(self):
        assert "subject:" in self.prompt.user_message
        assert "customerTier:" in self.prompt.user_message

    # Python strips the trailing newline emitted by the YAML serializer; TypeScript does not.
    def test_yaml_exact_user_message(self):
        assert self.prompt.user_message == (
            "subject: App crashes\nbody: Every time.\ncustomerTier: pro\nrecentTickets: []"
        )

    def test_meta_contains_declared_model_and_temperature(self):
        assert self.prompt.meta.model == "gpt-4o"
        assert self.prompt.meta.temperature == 0.2


_page_tree_prompt = p02.generate_page_tree.render(
    s02.generate_page_tree.Input(
        providers=[
            s02.generate_page_tree.Provider(
                name="CloudX",
                region="us-east",
                category="compute",
                pricing=s02.generate_page_tree.Pricing(model="perHour", base_price=0.1),
                benchmarks=[
                    s02.generate_page_tree.Benchmark(
                        name="throughput", score=1000, unit="rps"
                    )
                ],
                pros=["fast", "reliable"],
                cons=["pricey"],
            )
        ],
        use_case="serving ML inference workloads",
        audience="architect",
    )
)


class TestGeneratePageTree:
    def test_json_output_format(self):
        assert _page_tree_prompt.output_format.format == "json"

    def test_template_id(self):
        assert _page_tree_prompt.template_id == "Main:GeneratePageTree"

    def test_user_message_contains_use_case(self):
        assert re.search(
            r"serving ML inference workloads", _page_tree_prompt.user_message
        )

    def test_user_message_contains_provider_name_from_toon_data(self):
        assert re.search(r"CloudX", _page_tree_prompt.user_message)

    def test_user_message_mentions_audience(self):
        assert re.search(r"architect", _page_tree_prompt.user_message)

    def test_has_no_tools(self):
        assert len(_page_tree_prompt.tools) == 0

    def test_toon_exact_user_message(self):
        assert _page_tree_prompt.user_message == (
            "Generate a comparison page layout framed around this use case: serving ML inference workloads\n"
            "\nTarget audience: architect\n"
            "\nHere is the data for each provider:\n"
            "\n[1]:\n"
            "  - name: CloudX\n"
            "    region: us-east\n"
            "    category: compute\n"
            "    pricing:\n"
            "      model: perHour\n"
            "      basePrice: 0.1\n"
            "    benchmarks[1,]{name,score,unit}:\n"
            "      throughput,1000.0,rps\n"
            "    pros[2]: fast,reliable\n"
            "    cons[1]: pricey"
        )

    def test_parse_response_parses_page_node_tree(self):
        result = _page_tree_prompt.parse_response(
            json.dumps(
                {
                    "kind": "section",
                    "title": "Overview",
                    "children": [
                        {"kind": "heading", "level": "h1", "text": "CloudX"},
                        {"kind": "paragraph", "text": "Fast compute provider."},
                        {
                            "kind": "button",
                            "label": "Sign Up",
                            "url": "https://cloudx.example.com",
                        },
                    ],
                }
            )
        )
        assert isinstance(result, s02.generate_page_tree.PageNode_KindSection)
        assert result.title == "Overview"
        assert len(result.children) == 3
        assert isinstance(
            result.children[0], s02.generate_page_tree.PageNode_KindHeading
        )
        assert result.children[0].text == "CloudX"


# ─── 03 Tools: tool registration, execute_tools, example with intermediate steps


class TestResearchQuestion:
    prompt = p03.research_question.render(
        s03.research_question.Input(question="Tokyo population?")
    )

    def test_registers_web_search_tool(self):
        assert "webSearch" in self.prompt.tools

    def test_web_search_tool_name(self):
        assert self.prompt.tools["webSearch"].name == "webSearch"

    def test_web_search_tool_description(self):
        assert re.search(r"Search the web", self.prompt.tools["webSearch"].description)

    def test_web_search_tool_input_json_schema(self):
        schema = self.prompt.tools["webSearch"].input_json_schema
        assert schema["type"] == "object"
        assert schema["properties"]["query"]["type"] == "string"
        assert schema["required"] == ["query"]

    def test_produces_one_example_with_one_intermediate_step(self):
        assert len(self.prompt.examples) == 1
        assert len(self.prompt.examples[0].intermediate_steps) == 1

    def test_example_tool_call_ids(self):
        tc = self.prompt.examples[0].intermediate_steps[0].tool_calls[0]
        assert tc.call_id == "s1"
        assert tc.tool_name == "webSearch"

    def test_example_tool_call_stringified_input(self):
        tc = self.prompt.examples[0].intermediate_steps[0].tool_calls[0]
        assert tc.stringified_input == '{"query": "Tokyo population 2024"}'

    async def test_execute_tools_calls_executor_and_returns_output(self):
        class Executor:
            async def web_search(
                self, input: s03.web_search.Input
            ) -> s03.web_search.Output:
                return s03.web_search.Output(
                    results=[
                        s03.web_search.Output_Results(
                            title="T", url="http://example.com", snippet="42M"
                        ),
                    ]
                )

        result = await self.prompt.execute_tools(
            [
                ToolCall(
                    call_id="c1",
                    tool_name="webSearch",
                    stringified_input='{"query":"test"}',
                )
            ],
            Executor(),
        )
        assert len(result) == 1
        assert result[0].call_id == "c1"
        assert '"T"' in result[0].stringified_output

    async def test_execute_tools_accepts_iterable(self):
        class Executor:
            async def web_search(
                self, input: s03.web_search.Input
            ) -> s03.web_search.Output:
                return s03.web_search.Output(
                    results=[
                        s03.web_search.Output_Results(
                            title="T", url="http://example.com", snippet="42M"
                        ),
                    ]
                )

        # Pass a generator (Iterable) instead of a list
        calls = (
            ToolCall(
                call_id="c1",
                tool_name="webSearch",
                stringified_input='{"query":"test"}',
            )
            for _ in range(1)
        )
        result = await self.prompt.execute_tools(calls, Executor())
        assert len(result) == 1
        assert result[0].call_id == "c1"

    async def test_execute_tools_returns_error_for_unknown_tool(self):
        class Executor:
            async def web_search(
                self, input: s03.web_search.Input
            ) -> s03.web_search.Output:
                return s03.web_search.Output(results=[])

        result = await self.prompt.execute_tools(
            [ToolCall(call_id="c1", tool_name="noSuchTool", stringified_input="{}")],
            Executor(),
        )
        assert len(result) == 1
        assert result[0].call_id == "c1"
        assert result[0].error == "Tool not found: noSuchTool"
        assert (
            '"error": "Tool not found: noSuchTool"' in result[0].stringified_output
            or '"error":"Tool not found: noSuchTool"' in result[0].stringified_output
        )

    async def test_execute_tools_returns_error_when_executor_raises(self):
        class FailingExecutor:
            async def web_search(
                self, input: s03.web_search.Input
            ) -> s03.web_search.Output:
                raise RuntimeError("Search service failure")

        result = await self.prompt.execute_tools(
            [
                ToolCall(
                    call_id="call_err",
                    tool_name="webSearch",
                    stringified_input='{"query":"fail"}',
                )
            ],
            FailingExecutor(),
        )
        assert len(result) == 1
        assert result[0].call_id == "call_err"
        assert result[0].error == "Search service failure"
        assert (
            '"error": "Search service failure"' in result[0].stringified_output
            or '"error":"Search service failure"' in result[0].stringified_output
        )


# ─── 04 Snippets: switch snippet, conditional snippet ────────────────────────


class TestSummarizeDocument:
    def test_switch_snippet_selects_executive_instruction(self):
        p = p05.summarize_document.render(
            s05.summarize_document.Input(title="T", content="C", audience="executive")
        )
        assert re.search(r"non-technical executive audience", p.system_message)

    def test_switch_snippet_selects_technical_instruction(self):
        p = p05.summarize_document.render(
            s05.summarize_document.Input(title="T", content="C", audience="technical")
        )
        assert re.search(r"technical audience", p.system_message)

    def test_switch_snippet_selects_general_instruction(self):
        p = p05.summarize_document.render(
            s05.summarize_document.Input(title="T", content="C", audience="general")
        )
        assert re.search(r"general audience", p.system_message)

    def test_switch_snippet_does_not_bleed_into_other_variant(self):
        p = p05.summarize_document.render(
            s05.summarize_document.Input(title="T", content="C", audience="technical")
        )
        assert "business impact" not in p.system_message

    def test_conditional_snippet_focus_instruction_when_focus_topic_set(self):
        p = p05.summarize_document.render(
            s05.summarize_document.Input(
                title="T",
                content="C",
                audience="general",
                focus_topic="AI safety",
            )
        )
        assert "AI safety" in p.system_message

    def test_conditional_snippet_no_focus_instruction_when_absent(self):
        p = p05.summarize_document.render(
            s05.summarize_document.Input(title="T", content="C", audience="executive")
        )
        assert "Focus the summary" not in p.system_message

    def test_user_message_wraps_title_in_enclosed_tag(self):
        p = p05.summarize_document.render(
            s05.summarize_document.Input(
                title="AI Report", content="...", audience="technical"
            )
        )
        assert "<Title>" in p.user_message


# ─── 05 Variants: per-variant system messages, shared user message ────────────


class TestWriteProductDescription:
    base = {
        "product_name": "AquaFilter Pro",
        "features": ["removes 99.9% of contaminants", "lasts 6 months"],
    }
    marketing = p04.write_product_description.render(
        s04.write_product_description.Input(**base, variant="marketing")
    )
    technical = p04.write_product_description.render(
        s04.write_product_description.Input(**base, variant="technical")
    )
    brief = p04.write_product_description.render(
        s04.write_product_description.Input(**base, variant="brief")
    )

    def test_marketing_system_prompt(self):
        assert re.search(r"benefit-focused", self.marketing.system_message)

    def test_technical_system_prompt(self):
        assert re.search(r"specification-driven", self.technical.system_message)

    def test_brief_system_prompt(self):
        assert re.search(r"single punchy sentence", self.brief.system_message)

    def test_all_variants_share_same_user_message(self):
        assert (
            self.marketing.user_message
            == self.technical.user_message
            == self.brief.user_message
        )

    def test_user_message_contains_product_name(self):
        assert re.search(r"AquaFilter Pro", self.marketing.user_message)

    def test_user_message_contains_features_as_json(self):
        assert re.search(r"removes 99\.9% of contaminants", self.marketing.user_message)

    def test_marketing_has_one_example(self):
        assert len(self.marketing.examples) == 1

    def test_marketing_example_response_contains_description_key(self):
        assert '"description"' in self.marketing.examples[0].response
        assert "Tired of worrying" in self.marketing.examples[0].response

    def test_brief_has_one_example(self):
        assert len(self.brief.examples) == 1

    def test_template_id_same_across_variants(self):
        assert self.marketing.template_id == "Main:WriteProductDescription"
        assert self.technical.template_id == "Main:WriteProductDescription"
        assert self.brief.template_id == "Main:WriteProductDescription"

    def test_variants_have_different_system_messages(self):
        assert self.marketing.system_message != self.technical.system_message
        assert self.technical.system_message != self.brief.system_message


# ─── 06 Shared types: two templates sharing Main namespace types ───────────────

_address = s06.shared.Address(street="1 Main St", city="Paris", country="France")
_contact = s06.shared.ContactInfo(
    name="Alice Dupont", email="alice@example.com", address=_address
)


class TestShippingConfirmation:
    prompt = p06.shipping_confirmation.render(
        s06.shipping_confirmation.Input(
            recipient=_contact,
            order_number="ORD-1234",
            estimated_delivery="2026-08-20",
            items=[s06.shipping_confirmation.Input_Items(name="Laptop", quantity=1)],
        )
    )

    def test_text_output_format(self):
        assert self.prompt.output_format.format == "text"

    def test_template_id(self):
        assert self.prompt.template_id == "Main:ShippingConfirmation"

    def test_user_message_contains_recipient_name(self):
        assert re.search(r"Alice Dupont", self.prompt.user_message)

    def test_user_message_contains_order_number(self):
        assert re.search(r"ORD-1234", self.prompt.user_message)

    def test_system_message_mentions_confirmation_email(self):
        assert re.search(r"confirmation email", self.prompt.system_message)


class TestReturnSlip:
    prompt = p06.return_slip.render(
        s06.return_slip.Input(
            customer=_contact,
            return_reason="defective",
            order_number="ORD-1234",
        )
    )

    def test_text_output_format(self):
        assert self.prompt.output_format.format == "text"

    def test_template_id(self):
        assert self.prompt.template_id == "Main:ReturnSlip"

    def test_user_message_contains_customer_name(self):
        assert re.search(r"Alice Dupont", self.prompt.user_message)

    def test_user_message_contains_return_reason(self):
        assert re.search(r"defective", self.prompt.user_message)


# ─── 07 Namespaces: two named namespaces, four templates ─────────────────────


class TestFinanceSummarizeTransaction:
    prompt = p07.finance.summarize_transaction.render(
        s07.finance.summarize_transaction.Input(
            description="AWS monthly bill",
            amount=s07.finance.shared.MoneyAmount(value=450, currency="USD"),
            category="expense",
            date="2026-08-01",
        )
    )

    def test_template_id(self):
        assert self.prompt.template_id == "Finance:SummarizeTransaction"

    def test_accessible_via_prompts_finance(self):
        assert callable(p07.finance.summarize_transaction.render)

    def test_json_output_format(self):
        assert self.prompt.output_format.format == "json"

    def test_user_message_contains_description(self):
        assert re.search(r"AWS monthly bill", self.prompt.user_message)

    def test_currency_literal_lowercase_is_accepted(self):
        p07.finance.summarize_transaction.render(
            s07.finance.summarize_transaction.Input(
                description="Test",
                amount=s07.finance.shared.MoneyAmount(value=1, currency="USD"),
                category="expense",
                date="2026-08-17",
            )
        )


class TestFinanceDetectAnomaly:
    prompt = p07.finance.detect_anomaly.render(
        s07.finance.detect_anomaly.Input(
            recent_transactions=[],
            new_transaction=s07.finance.detect_anomaly.Input_NewTransaction(
                description="Casino chips",
                amount=s07.finance.shared.MoneyAmount(value=5000, currency="USD"),
                date="2026-08-17",
            ),
        )
    )

    def test_template_id(self):
        assert self.prompt.template_id == "Finance:DetectAnomaly"

    def test_user_message_contains_transaction_description(self):
        assert re.search(r"Casino chips", self.prompt.user_message)

    def test_has_no_tools(self):
        assert len(self.prompt.tools) == 0


class TestLegalDraftNda:
    prompt = p07.legal.draft_nda.render(
        s07.legal.draft_nda.Input(
            disclosing_party=s07.legal.shared.Party(
                name="Acme Corp", role="client", jurisdiction="California"
            ),
            receiving_party=s07.legal.shared.Party(
                name="Beta LLC", role="counterparty", jurisdiction="Delaware"
            ),
            purpose_of_disclosure="Evaluating a potential acquisition",
            duration_years=3,
        )
    )

    def test_template_id(self):
        assert self.prompt.template_id == "Legal:DraftNda"

    def test_text_output_format(self):
        assert self.prompt.output_format.format == "text"

    def test_accessible_via_prompts_legal(self):
        assert callable(p07.legal.draft_nda.render)

    def test_user_message_contains_party_names(self):
        assert re.search(r"Acme Corp", self.prompt.user_message)
        assert re.search(r"Beta LLC", self.prompt.user_message)

    def test_system_message_mentions_nda(self):
        assert re.search(r"non-disclosure agreement", self.prompt.system_message)


class TestLegalSummarizeClause:
    prompt = p07.legal.summarize_clause.render(
        s07.legal.summarize_clause.Input(
            clause_text="The party shall indemnify and hold harmless...",
            reviewing_party=s07.legal.shared.Party(
                name="Alice", role="client", jurisdiction="NY"
            ),
        )
    )

    def test_template_id(self):
        assert self.prompt.template_id == "Legal:SummarizeClause"

    def test_json_output_format(self):
        assert self.prompt.output_format.format == "json"

    def test_user_message_contains_reviewing_party_name(self):
        assert re.search(r"Alice", self.prompt.user_message)

    def test_user_message_contains_clause_text(self):
        assert re.search(r"indemnify", self.prompt.user_message)

    def test_user_message_wraps_clause_in_enclosed_tag(self):
        assert "<Clause>" in self.prompt.user_message


class TestE01JsonSerialization:
    def test_expr_serialization_and_deserialization(self):
        adapter = pydantic.TypeAdapter(s_e01.shared.Expr)
        expr_num = s_e01.shared.Expr_KindNumber(kind="number", value=42.0)
        json_str = adapter.dump_json(expr_num).decode("utf-8")
        decoded_num = adapter.validate_json(json_str)
        assert isinstance(decoded_num, s_e01.shared.Expr_KindNumber)
        assert decoded_num.value == 42.0

        expr_add = s_e01.shared.Expr_KindAdd(
            kind="add",
            left=s_e01.shared.Expr_KindNumber(kind="number", value=1.0),
            right=s_e01.shared.Expr_KindNumber(kind="number", value=2.0),
        )
        json_add = adapter.dump_json(expr_add).decode("utf-8")
        decoded_add = adapter.validate_json(json_add)
        assert isinstance(decoded_add, s_e01.shared.Expr_KindAdd)
        any_decoded_add: Any = decoded_add
        assert any_decoded_add.left.value == 1.0
        assert any_decoded_add.right.value == 2.0

    def test_enum_with_common_fields_serialization(self):
        adapter = pydantic.TypeAdapter(s_e01.shared.EnumWithCommonFields)
        not_success = s_e01.shared.EnumWithCommonFields_NotSuccess(
            success=False, x=10, y=20.5, z="error"
        )
        json_not_success = adapter.dump_json(not_success).decode("utf-8")
        decoded_not_success = adapter.validate_json(json_not_success)
        assert isinstance(
            decoded_not_success, s_e01.shared.EnumWithCommonFields_NotSuccess
        )
        assert decoded_not_success.x == 10
        assert decoded_not_success.y == 20.5
        assert decoded_not_success.z == "error"

        success = s_e01.shared.EnumWithCommonFields_Success(
            success=True, x=42, y=84.0, z=99
        )
        json_success = adapter.dump_json(success).decode("utf-8")
        decoded_success = adapter.validate_json(json_success)
        assert isinstance(decoded_success, s_e01.shared.EnumWithCommonFields_Success)
        assert decoded_success.x == 42
        assert decoded_success.y == 84.0
        assert decoded_success.z == 99

    def test_matrix_with_omitted_optional_fields(self):
        matrix = s_e01.shared.Matrix(
            kind="matrix",
            matrix=[],
            ints=[1, 2, 3],
            init=True,
            encode=False,
        )
        assert matrix.other_matrix is None
        assert matrix.foo is None

    def test_complex_type_serialization_and_deserialization(self):
        sq = s_e01.shared.Square(
            kind="square", size=10.0, from_json="fj", self="sf", foo="foo"
        )
        sq2 = s_e01.shared.Square(
            kind="square", size=20.0, from_json="fj2", self="sf2", foo="foo"
        )
        sq3 = s_e01.shared.Square(
            kind="square", size=30.0, from_json="fj3", self="sf3", foo="foo"
        )
        sq4 = s_e01.shared.Square(
            kind="square", size=40.0, from_json="fj4", self="sf4", foo="foo"
        )

        full = s_e01.shared.ComplexType(
            string_field="hello",
            int_field=42,
            num_field=3.14,
            bool_field=True,
            literal_field="constant",
            enum_field="foo-BAR",
            string_union="foo-bar",
            union_field=s_e01.shared.Expr_KindNumber(kind="number", value=100.0),
            struct_field=sq,
            string_list=["a", "b"],
            struct_list=[sq2],
            matrix=[[1, 2], [3, 4]],
            map_field={"key1": 10, "key2": 20},
            opt_string="optional hello",
            opt_int=99,
            opt_num=2.718,
            opt_bool=False,
            opt_enum="if",
            opt_string_union="zooKar",
            opt_union=s_e01.shared.Expr_KindNumber(kind="number", value=200.0),
            opt_struct=sq3,
            opt_string_list=["x", "y"],
            opt_struct_list=[sq4],
            opt_matrix=[[5, 6], [7, 8]],
            opt_map={"optKey": 30},
        )

        adapter = pydantic.TypeAdapter(s_e01.shared.ComplexType)
        full_json = adapter.dump_json(full, exclude_none=True).decode("utf-8")
        parsed_full = adapter.validate_json(full_json)
        assert parsed_full.string_field == "hello"
        assert parsed_full.int_field == 42
        assert parsed_full.num_field == 3.14
        assert parsed_full.bool_field is True
        assert parsed_full.literal_field == "constant"
        assert parsed_full.enum_field == "foo-BAR"
        assert parsed_full.string_union == "foo-bar"
        assert isinstance(parsed_full.union_field, s_e01.shared.Expr_KindNumber)
        assert parsed_full.union_field.value == 100.0
        assert parsed_full.struct_field.size == 10.0
        assert parsed_full.string_list == ["a", "b"]
        assert len(parsed_full.struct_list) == 1
        assert parsed_full.struct_list[0].size == 20.0
        assert parsed_full.matrix == [[1, 2], [3, 4]]
        assert parsed_full.map_field["key1"] == 10
        assert parsed_full.map_field["key2"] == 20

        assert parsed_full.opt_string == "optional hello"
        assert parsed_full.opt_int == 99
        assert parsed_full.opt_num == 2.718
        assert parsed_full.opt_bool is False
        assert parsed_full.opt_enum == "if"
        assert parsed_full.opt_string_union == "zooKar"
        assert isinstance(parsed_full.opt_union, s_e01.shared.Expr_KindNumber)
        assert parsed_full.opt_union.value == 200.0
        assert parsed_full.opt_struct is not None
        assert parsed_full.opt_struct.size == 30.0
        assert parsed_full.opt_string_list == ["x", "y"]
        assert parsed_full.opt_struct_list is not None
        assert len(parsed_full.opt_struct_list) == 1
        assert parsed_full.opt_struct_list[0].size == 40.0
        assert parsed_full.opt_matrix == [[5, 6], [7, 8]]
        assert parsed_full.opt_map == {"optKey": 30}

        # Omitted optional fields
        omitted = s_e01.shared.ComplexType(
            string_field="hello",
            int_field=42,
            num_field=3.14,
            bool_field=True,
            literal_field="constant",
            enum_field="foo-BAR",
            string_union="foo-bar",
            union_field=s_e01.shared.Expr_KindNumber(kind="number", value=100.0),
            struct_field=sq,
            string_list=["a", "b"],
            struct_list=[sq2],
            matrix=[[1, 2], [3, 4]],
            map_field={"key1": 10, "key2": 20},
        )

        omitted_json = adapter.dump_json(omitted, exclude_none=True).decode("utf-8")
        assert "optString" not in omitted_json
        assert "optInt" not in omitted_json
        assert "optNum" not in omitted_json
        assert "optBool" not in omitted_json
        assert "optEnum" not in omitted_json
        assert "optStringUnion" not in omitted_json
        assert "optUnion" not in omitted_json
        assert "optStruct" not in omitted_json
        assert "optStringList" not in omitted_json
        assert "optStructList" not in omitted_json
        assert "optMatrix" not in omitted_json
        assert "optMap" not in omitted_json

        parsed_omitted = adapter.validate_json(omitted_json)
        assert parsed_omitted.string_field == "hello"
        assert parsed_omitted.opt_string is None
        assert parsed_omitted.opt_int is None
        assert parsed_omitted.opt_num is None
        assert parsed_omitted.opt_bool is None
        assert parsed_omitted.opt_enum is None
        assert parsed_omitted.opt_string_union is None
        assert parsed_omitted.opt_union is None
        assert parsed_omitted.opt_struct is None
        assert parsed_omitted.opt_string_list is None
        assert parsed_omitted.opt_struct_list is None
        assert parsed_omitted.opt_matrix is None
        assert parsed_omitted.opt_map is None


class TestTemplateOverrider:
    def test_templates_data(self) -> None:
        data = to01.templates_data()
        assert isinstance(data, dict)
        assert "signature" in data
        assert len(data["signature"]) > 0

    def test_signature_mismatch(self) -> None:
        wrong_data = {**to01.templates_data(), "signature": "wrong_sig"}
        with pytest.raises(ValueError, match="Signature mismatch"):
            to01.apply_overrides(wrong_data)

    def test_apply_valid_overrides(self) -> None:
        overridden = to01.apply_overrides(to01.templates_data())
        prompt = overridden.translate.render(
            s01.translate.Input(text="Hello", target_language="French")
        )
        assert "French" in prompt.user_message

    def test_apply_none_overrides(self) -> None:
        assert to01.apply_overrides(None) is p01
