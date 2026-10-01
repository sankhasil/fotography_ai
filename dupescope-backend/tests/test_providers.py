from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from dupescope.providers import (
    DEFAULT_MODEL,
    DEFAULT_PROVIDER,
    Provider,
    chat,
    list_models,
    resolve,
)


# ── Registry ──────────────────────────────────────────────────────────────────

def test_default_provider_is_ollama_local():
    assert resolve().name == DEFAULT_PROVIDER == "ollama-local"
    assert resolve().style == "ollama"
    assert DEFAULT_MODEL == "llava"


def test_unknown_name_is_rejected_with_guidance():
    with pytest.raises(ValueError) as exc:
        resolve("big-pickle")
    message = str(exc.value)
    assert "ollama-local" in message
    assert "base URL" in message


def test_base_url_becomes_openai_compatible_provider():
    """How a future local server (LM Studio, llama.cpp, vLLM) gets added: config only."""
    p = resolve("http://localhost:1234/v1/")
    assert p.style == "openai"
    assert p.base_url == "http://localhost:1234/v1"   # trailing slash trimmed


def test_https_loopback_base_url_also_accepted():
    assert resolve("https://localhost:8000/v1").style == "openai"


# ── Payload shapes ────────────────────────────────────────────────────────────

def _posted(kwargs, provider, reply):
    with patch("dupescope.providers.requests.post") as post:
        post.return_value = MagicMock(raise_for_status=lambda: None, json=lambda: reply)
        result = chat(provider, "m", "p", **kwargs)
    return post.call_args, result


def test_ollama_payload_uses_bare_base64_images():
    call, _ = _posted({"image_b64": "BASE64", "temperature": 0},
                      resolve(), {"message": {"content": "ok"}})

    url, = call.args
    body = call.kwargs["json"]
    assert url.endswith("/api/chat")
    assert body["messages"][-1]["images"] == ["BASE64"]
    assert body["options"]["temperature"] == 0


def test_openai_payload_uses_data_url_and_translates_options():
    call, _ = _posted({"image_b64": "BASE64", "seed": 42, "num_predict": 200},
                      resolve("http://localhost:1234/v1"),
                      {"choices": [{"message": {"content": "ok"}}]})

    url, = call.args
    body = call.kwargs["json"]
    assert url.endswith("/chat/completions")
    part = body["messages"][-1]["content"][1]
    assert part["image_url"]["url"] == "data:image/jpeg;base64,BASE64"
    assert body["seed"] == 42
    assert body["max_tokens"] == 200
    assert "options" not in body        # ollama-only key must not leak


def test_system_prompt_is_prepended_when_given():
    call, _ = _posted({"system": "SYS"}, resolve(), {"message": {"content": "ok"}})
    assert call.kwargs["json"]["messages"][0]["role"] == "system"


def test_no_system_prompt_sends_single_message():
    call, _ = _posted({}, resolve(), {"message": {"content": "ok"}})
    assert len(call.kwargs["json"]["messages"]) == 1


def test_openai_response_content_extracted():
    _, result = _posted({}, resolve("http://localhost:1234/v1"),
                        {"choices": [{"message": {"content": " spaced "}}]})
    assert result == "spaced"


# ── Vision filtering ──────────────────────────────────────────────────────────
#
# Guards the expensive mistake: pointing culling at a text-only model. Its
# verdicts look confident but it never saw the image.

def test_ollama_lists_only_models_with_clip_family():
    tags = {"models": [
        {"name": "llava:latest", "details": {"families": ["llama", "clip"]}},
        {"name": "qwen2.5-coder:7b", "details": {"families": ["qwen2"]}},
        {"name": "deepseek-coder-v2:16b", "details": {"families": ["deepseek2"]}},
    ]}
    with patch("dupescope.providers.requests.get") as get:
        get.return_value = MagicMock(json=lambda: tags)
        assert list_models(resolve()) == ["llava:latest"]


@pytest.mark.parametrize("model_id", [
    "llava-llama3", "bakllava:1", "minicpm-v:latest", "moondream",
    "gemma3:4b", "qwen2.5-vl:7b", "granite3.2-vision:2b",
])
def test_openai_style_vision_markers_are_recognised(model_id):
    with patch("dupescope.providers.requests.get") as get:
        get.return_value = MagicMock(json=lambda: {"data": [{"id": model_id}]})
        assert list_models(resolve("http://localhost:1234/v1")) == [model_id]


@pytest.mark.parametrize("model_id", [
    "qwen2.5-coder:7b", "deepseek-coder-v2:16b", "big-pickle", "text-embed",
])
def test_text_only_models_are_hidden_from_listing(model_id):
    with patch("dupescope.providers.requests.get") as get:
        get.return_value = MagicMock(json=lambda: {"data": [{"id": model_id}]})
        assert list_models(resolve("http://localhost:1234/v1")) == []


# ── Verdict parsing ───────────────────────────────────────────────────────────

def test_latex_escaped_underscores_do_not_break_verdict_parsing():
    """LLaVA emits emotion\\_impact; "\\_" is illegal JSON and killed the verdict."""
    import json
    from dupescope.core import strip_bad_escapes

    raw = r'{"emotion\_impact": 8, "keep": true}'
    with pytest.raises(ValueError):
        json.loads(raw)
    assert json.loads(strip_bad_escapes(raw)) == {"emotion_impact": 8, "keep": True}


def test_valid_json_escapes_survive_stripping():
    import json
    from dupescope.core import strip_bad_escapes

    raw = r'{"reason": "he said \"hi\" \n newline \u00e9 tab\t end"}'
    assert json.loads(strip_bad_escapes(raw))["reason"] == \
        'he said "hi" \n newline \u00e9 tab\t end'


def test_strip_bad_escapes_leaves_clean_json_untouched():
    from dupescope.core import strip_bad_escapes
    clean = '{"composition": 7, "keep": false}'
    assert strip_bad_escapes(clean) == clean


def test_evaluate_image_ai_returns_verdict_from_latex_escaped_reply(tmp_path):
    from dupescope import core

    image = tmp_path / "photo.png"
    image.write_bytes(b"\x89PNG\r\n\x1a\n")

    with patch.object(core, "encode_image", return_value="BASE64"), \
         patch.object(core, "chat",
                      return_value=r'{"emotion\_impact": 8, "keep": true}'):
        verdict = core.evaluate_image_ai(image, {"sharpness": 5, "exposure": 5})
    assert verdict == {"emotion_impact": 8, "keep": True}


def test_evaluate_image_ai_returns_none_when_reply_is_not_json(tmp_path):
    from dupescope import core

    image = tmp_path / "photo.png"
    image.write_bytes(b"\x89PNG\r\n\x1a\n")

    with patch.object(core, "encode_image", return_value="BASE64"), \
         patch.object(core, "chat", return_value="I cannot help with that."):
        assert core.evaluate_image_ai(image, {}) is None


def test_evaluate_image_ai_returns_none_when_call_degrades(tmp_path):
    from dupescope import core

    image = tmp_path / "photo.png"
    image.write_bytes(b"\x89PNG\r\n\x1a\n")

    with patch.object(core, "encode_image", return_value="BASE64"), \
         patch.object(core, "chat", return_value=""):
        assert core.evaluate_image_ai(image, {}) is None


def test_evaluate_image_ai_returns_none_when_image_cannot_be_encoded(tmp_path):
    from dupescope import core

    image = tmp_path / "photo.png"
    image.write_bytes(b"\x89PNG\r\n\x1a\n")

    with patch.object(core, "encode_image", return_value=""):
        assert core.evaluate_image_ai(image, {}) is None


# ── No-verdict scoring ─────────────────────────────────────────────────────────
# Regression guard: a dropped verdict used to be scored as a fabricated
# neutral 5.0, which read as "average" while meaning "never analysed".
# 37 of 126 photos were silently decided that way.

def test_missing_ai_verdict_is_not_scored_as_a_neutral_five():
    from dupescope import core

    result = core.compute_hybrid_score({"overall_local": 4.4}, None)
    assert result["ai_verdict"] is False
    assert result["ai_score"] is None
    assert result["hybrid_score"] is None


def test_missing_ai_verdict_defers_to_the_local_decision():
    from dupescope import core

    # Local says reject, no AI verdict available -> reject on local merit.
    assert core.compute_hybrid_score(
        {"overall_local": 4.4, "keep_local": False}, None)["keep"] is False
    # Local says keep, no AI verdict available -> keep, not a coin flip.
    assert core.compute_hybrid_score(
        {"overall_local": 5.6, "keep_local": True}, None)["keep"] is True


def test_missing_ai_verdict_states_why_in_the_reason():
    from dupescope import core

    assert "no AI verdict" in core.compute_hybrid_score({"overall_local": 5}, None)["reason"]


def test_real_verdict_is_still_weighted_and_marked_present():
    from dupescope import core

    result = core.compute_hybrid_score(
        {"overall_local": 5.0, "keep_local": True},
        {"composition": 9, "emotion_impact": 9, "subject_clarity": 9,
         "aesthetic": 9, "keep": True})
    assert result["ai_verdict"] is True
    assert result["ai_score"] == 9.0
    assert result["hybrid_score"] == 6.2


def test_results_without_a_hybrid_score_still_sort():
    # hybrid_score is now None when no verdict arrived; sorting must not
    # compare None against float and raise.
    from dupescope import core

    rows = [
        {"name": "no-verdict", "overall_local": 5.0, "hybrid_score": None},
        {"name": "verdict", "overall_local": 1.0, "hybrid_score": 6.0},
    ]
    rows.sort(key=lambda x: (x.get("hybrid_score")
                             if x.get("hybrid_score") is not None
                             else x.get("overall_local", 5)), reverse=True)
    assert [r["name"] for r in rows] == ["verdict", "no-verdict"]


def test_build_report_counts_photos_with_no_ai_verdict():
    from dupescope import core

    class Args:
        mode, threshold, no_recursive, no_ai = "dupes", 10, False, False

    report = core.build_report(
        Path("/tmp"), [], {}, [], [],
        keep=[{"name": "a", "ai_verdict": False}],
        delete=[{"name": "b", "ai_verdict": False}, {"name": "c", "ai_verdict": True}],
        args=Args())
    assert report["summary"]["no_ai_verdict"] == 2


# ── Provider boundary ──────────────────────────────────────────────────────────

def test_resolve_rejects_a_remote_host():
    # Photos must never leave the machine.
    with pytest.raises(ValueError, match="non-local"):
        resolve("https://api.openai.com/v1")


def test_resolve_rejects_an_ip_outside_loopback():
    with pytest.raises(ValueError, match="non-local"):
        resolve("http://10.0.0.5:1234/v1")


@pytest.mark.parametrize("url", [
    "http://localhost:11434/v1",
    "http://127.0.0.1:1234/v1",
    "http://[::1]:1234/v1",
])
def test_resolve_accepts_loopback_urls(url):
    assert resolve(url).base_url == url


def test_resolve_still_returns_the_named_local_provider():
    assert resolve().name == "ollama-local"
    assert resolve("ollama-local").style == "ollama"

def test_chat_returns_fallback_when_server_raises():
    with patch("dupescope.providers.requests.post", side_effect=OSError("no route")):
        assert chat(resolve(), "llava", "p", fallback="recommended DELETE") \
            == "recommended DELETE"


def test_chat_returns_fallback_on_empty_content():
    with patch("dupescope.providers.requests.post") as post:
        post.return_value = MagicMock(raise_for_status=lambda: None,
                                      json=lambda: {"message": {"content": ""}})
        assert chat(resolve(), "llava", "p", fallback="fb") == "fb"


def test_chat_returns_fallback_on_http_error():
    with patch("dupescope.providers.requests.post") as post:
        post.return_value = MagicMock(
            raise_for_status=lambda: (_ for _ in ()).throw(RuntimeError("403")))
        assert chat(resolve(), "llava", "p", fallback="fb") == "fb"


def test_list_models_returns_empty_when_server_refused():
    with patch("dupescope.providers.requests.get", side_effect=OSError("refused")):
        assert list_models(resolve()) == []
