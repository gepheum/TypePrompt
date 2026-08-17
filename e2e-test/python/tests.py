"""
Comprehensive tests covering all spec features across all example projects.
"""

import sys
import os
import re
import pytest

sys.path.insert(0, os.path.dirname(__file__))

from gen.prompts_01 import prompts as p01, schema as s01
from gen.prompts_02 import prompts as p02, schema as s02
from gen.prompts_03 import prompts as p03, schema as s03, ToolCall
from gen.prompts_04 import prompts as p04, schema as s04
from gen.prompts_05 import prompts as p05, schema as s05
from gen.prompts_06 import prompts as p06, schema as s06
from gen.prompts_07 import prompts as p07, schema as s07
from gen.prompts_08 import prompts as p08, schema as s08


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
        s02.triage_ticket.Input(subject="App crashes", body="Every time.")
    )

    def test_json_output_format(self):
        assert self.prompt.output_format.format == "json"

    def test_c_content_stripped_to_plain_text(self):
        assert "urgency" in self.prompt.system_message
        assert '"critical"' in self.prompt.system_message
        assert "<c>" not in self.prompt.system_message

    def test_produces_two_examples(self):
        assert len(self.prompt.examples) == 2

    def test_first_example_response_contains_output_category(self):
        assert '"technicalIssue"' in self.prompt.examples[0].response

    def test_second_example_response_contains_output_category(self):
        assert '"featureRequest"' in self.prompt.examples[1].response

    def test_parse_response_parses_json(self):
        result = self.prompt.parse_response(
            '{"category":"billing","urgency":"low","summary":"Invoice"}'
        )
        assert result.category == "billing"
        assert result.urgency == "low"

    def test_parse_response_strips_json_code_fences(self):
        result = self.prompt.parse_response(
            '```json\n{"category":"other","urgency":"medium","summary":"x"}\n```'
        )
        assert result.category == "other"

    def test_parse_response_strips_plain_code_fences(self):
        result = self.prompt.parse_response(
            '```\n{"category":"other","urgency":"medium","summary":"x"}\n```'
        )
        assert result.category == "other"

    def test_optional_field_absent_when_omitted(self):
        result = self.prompt.parse_response(
            '{"category":"featureRequest","urgency":"low","summary":"Dark mode"}'
        )
        assert result.suggested_reply is None

    def test_user_message_wraps_subject_in_enclosed_tag(self):
        assert "<Subject>" in self.prompt.user_message


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

    async def test_execute_tools_throws_for_unknown_tool(self):
        class Executor:
            async def web_search(
                self, input: s03.web_search.Input
            ) -> s03.web_search.Output:
                return s03.web_search.Output(results=[])

        with pytest.raises(Exception):
            await self.prompt.execute_tools(
                [
                    ToolCall(
                        call_id="c1", tool_name="noSuchTool", stringified_input="{}"
                    )
                ],
                Executor(),
            )


# ─── 04 Snippets: switch snippet, conditional snippet ────────────────────────


class TestSummarizeDocument:
    def test_switch_snippet_selects_executive_instruction(self):
        p = p04.summarize_document.render(
            s04.summarize_document.Input(title="T", content="C", audience="executive")
        )
        assert re.search(r"non-technical executive audience", p.system_message)

    def test_switch_snippet_selects_technical_instruction(self):
        p = p04.summarize_document.render(
            s04.summarize_document.Input(title="T", content="C", audience="technical")
        )
        assert re.search(r"technical audience", p.system_message)

    def test_switch_snippet_selects_general_instruction(self):
        p = p04.summarize_document.render(
            s04.summarize_document.Input(title="T", content="C", audience="general")
        )
        assert re.search(r"general audience", p.system_message)

    def test_switch_snippet_does_not_bleed_into_other_variant(self):
        p = p04.summarize_document.render(
            s04.summarize_document.Input(title="T", content="C", audience="technical")
        )
        assert "business impact" not in p.system_message

    def test_conditional_snippet_focus_instruction_when_focus_topic_set(self):
        p = p04.summarize_document.render(
            s04.summarize_document.Input(
                title="T",
                content="C",
                audience="general",
                focus_topic="AI safety",
            )
        )
        assert "AI safety" in p.system_message

    def test_conditional_snippet_no_focus_instruction_when_absent(self):
        p = p04.summarize_document.render(
            s04.summarize_document.Input(title="T", content="C", audience="executive")
        )
        assert "Focus the summary" not in p.system_message

    def test_user_message_wraps_title_in_enclosed_tag(self):
        p = p04.summarize_document.render(
            s04.summarize_document.Input(
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
    marketing = p05.write_product_description.render(
        s05.write_product_description.Input(**base, variant="marketing")
    )
    technical = p05.write_product_description.render(
        s05.write_product_description.Input(**base, variant="technical")
    )
    brief = p05.write_product_description.render(
        s05.write_product_description.Input(**base, variant="brief")
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


# ─── 06 Toon format: complex nested input types, format="toon" ───────────────

_toon_prompt = p06.write_comparison_article.render(
    s06.write_comparison_article.Input(
        providers=[
            s06.write_comparison_article.Provider(
                name="CloudX",
                region="us-east",
                category="compute",
                pricing=s06.write_comparison_article.Pricing(
                    model="perHour", base_price=0.1
                ),
                benchmarks=[
                    s06.write_comparison_article.Benchmark(
                        name="throughput", score=1000, unit="rps"
                    )
                ],
                pros=["fast"],
                cons=["pricey"],
            )
        ],
        use_case="serving ML inference workloads",
        audience="architect",
    )
)


class TestWriteComparisonArticle:
    def test_json_output_format(self):
        assert _toon_prompt.output_format.format == "json"

    def test_template_id(self):
        assert _toon_prompt.template_id == "Main:WriteComparisonArticle"

    def test_user_message_contains_use_case(self):
        assert re.search(r"serving ML inference workloads", _toon_prompt.user_message)

    def test_user_message_contains_provider_name_from_toon_data(self):
        assert re.search(r"CloudX", _toon_prompt.user_message)

    def test_user_message_mentions_audience(self):
        assert re.search(r"architect", _toon_prompt.user_message)

    def test_has_no_tools(self):
        assert len(_toon_prompt.tools) == 0


# ─── 07 Shared types: two templates sharing Main namespace types ───────────────

_address = s07.shared.Address(street="1 Main St", city="Paris", country="France")
_contact = s07.shared.ContactInfo(
    name="Alice Dupont", email="alice@example.com", address=_address
)


class TestShippingConfirmation:
    prompt = p07.shipping_confirmation.render(
        s07.shipping_confirmation.Input(
            recipient=_contact,
            order_number="ORD-1234",
            estimated_delivery="2026-08-20",
            items=[s07.shipping_confirmation.Input_Items(name="Laptop", quantity=1)],
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
    prompt = p07.return_slip.render(
        s07.return_slip.Input(
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


# ─── 08 Namespaces: two named namespaces, four templates ─────────────────────


class TestFinanceSummarizeTransaction:
    prompt = p08.finance.summarize_transaction.render(
        s08.finance.summarize_transaction.Input(
            description="AWS monthly bill",
            amount=s08.finance.shared.MoneyAmount(value=450, currency="usd"),
            category="expense",
            date="2026-08-01",
        )
    )

    def test_template_id(self):
        assert self.prompt.template_id == "Finance:SummarizeTransaction"

    def test_accessible_via_prompts_finance(self):
        assert callable(p08.finance.summarize_transaction.render)

    def test_json_output_format(self):
        assert self.prompt.output_format.format == "json"

    def test_user_message_contains_description(self):
        assert re.search(r"AWS monthly bill", self.prompt.user_message)

    # The currency literals in the schema are intentionally lowercase ("usd" etc.)
    def test_currency_literal_lowercase_is_accepted(self):
        p08.finance.summarize_transaction.render(
            s08.finance.summarize_transaction.Input(
                description="Test",
                amount=s08.finance.shared.MoneyAmount(value=1, currency="usd"),
                category="expense",
                date="2026-08-17",
            )
        )


class TestFinanceDetectAnomaly:
    prompt = p08.finance.detect_anomaly.render(
        s08.finance.detect_anomaly.Input(
            recent_transactions=[],
            new_transaction=s08.finance.detect_anomaly.Input_NewTransaction(
                description="Casino chips",
                amount=s08.finance.shared.MoneyAmount(value=5000, currency="usd"),
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
    prompt = p08.legal.draft_nda.render(
        s08.legal.draft_nda.Input(
            disclosing_party=s08.legal.shared.Party(
                name="Acme Corp", role="client", jurisdiction="California"
            ),
            receiving_party=s08.legal.shared.Party(
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
        assert callable(p08.legal.draft_nda.render)

    def test_user_message_contains_party_names(self):
        assert re.search(r"Acme Corp", self.prompt.user_message)
        assert re.search(r"Beta LLC", self.prompt.user_message)

    def test_system_message_mentions_nda(self):
        assert re.search(r"non-disclosure agreement", self.prompt.system_message)


class TestLegalSummarizeClause:
    prompt = p08.legal.summarize_clause.render(
        s08.legal.summarize_clause.Input(
            clause_text="The party shall indemnify and hold harmless...",
            reviewing_party=s08.legal.shared.Party(
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
