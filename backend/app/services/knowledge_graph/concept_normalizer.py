import re
from typing import List, Dict, Any, Tuple

class ConceptNormalizer:
    """
    Normalizes concept names, merges duplicates and aliases across sources,
    and calculates grounded importance scores.
    """

    STOP_PREFIXES = ["the ", "a ", "an "]

    @staticmethod
    def normalize_name(name: str) -> str:
        """Produces a deterministic normalized key for a concept name."""
        if not name:
            return ""
        s = name.strip().lower()
        # Remove leading stop words if present
        for prefix in ConceptNormalizer.STOP_PREFIXES:
            if s.startswith(prefix) and len(s) > len(prefix):
                s = s[len(prefix):]
                break
        # Remove non-alphanumeric except space and hyphen
        s = re.sub(r"[^\w\s\-]", "", s)
        # Collapse multiple spaces
        s = re.sub(r"\s+", " ", s).strip()
        return s

    @classmethod
    def are_aliases_or_equivalent(cls, name_a: str, name_b: str, aliases_a: List[str] = None, aliases_b: List[str] = None) -> bool:
        """Determines if two concept names are syntactic or semantic aliases."""
        norm_a = cls.normalize_name(name_a)
        norm_b = cls.normalize_name(name_b)

        if not norm_a or not norm_b:
            return False

        if norm_a == norm_b:
            return True

        # Check existing aliases
        aliases_a_norm = {cls.normalize_name(a) for a in (aliases_a or []) if a}
        aliases_b_norm = {cls.normalize_name(b) for b in (aliases_b or []) if b}

        if norm_b in aliases_a_norm or norm_a in aliases_b_norm:
            return True

        # Check if one is a plural / singular of the other
        if norm_a + "s" == norm_b or norm_b + "s" == norm_a:
            return True
        if norm_a + "es" == norm_b or norm_b + "es" == norm_a:
            return True

        # Suffix matching for specific educational phrases (e.g., "Chain Rule" and "Chain Rule Differentiation" / "Chain Rule Method")
        suffixes = [
            " method", " formula", " rule", " concept", " system", " diagram", 
            " algorithm", " differentiation", " integration", " technique", 
            " process", " calculation", " model", " schema", " overview"
        ]
        for suf in suffixes:
            if norm_a.endswith(suf) and norm_a[:-len(suf)] == norm_b:
                return True
            if norm_b.endswith(suf) and norm_b[:-len(suf)] == norm_a:
                return True

        # Check if one is a prefix of the other with a single trailing word
        if norm_a.startswith(norm_b + " ") or norm_b.startswith(norm_a + " "):
            remainder = norm_a[len(norm_b)+1:] if norm_a.startswith(norm_b + " ") else norm_b[len(norm_a)+1:]
            if remainder in [s.strip() for s in suffixes]:
                return True

        return False

    @classmethod
    def choose_canonical_name(cls, names: List[str]) -> str:
        """Picks the cleanest, best capitalized name among variants."""
        if not names:
            return ""
        scored = []
        for n in names:
            clean = n.strip()
            score = 0.0
            if clean and clean[0].isupper():
                score += 3.0
            # Heavily penalize names starting with "The ", "A ", "An "
            lower = clean.lower()
            for prefix in cls.STOP_PREFIXES:
                if lower.startswith(prefix):
                    score -= 5.0
                    break
            # Penalize overly verbose names
            if len(clean) > 35:
                score -= (len(clean) - 35) * 0.2
            scored.append((score, -len(clean), clean))
        scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
        return scored[0][2]

    @classmethod
    def merge_concepts(cls, raw_concepts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Merges raw extracted concept candidates into deduplicated,
        normalized concepts with consolidated evidence and calculated importance.
        """
        merged_groups: List[Dict[str, Any]] = []

        for candidate in raw_concepts:
            cand_name = candidate.get("name", "").strip()
            if not cand_name:
                continue

            cand_norm = cls.normalize_name(cand_name)
            cand_aliases = candidate.get("aliases", [])
            cand_evidence = candidate.get("evidence", [])

            # Check if this candidate matches an existing merged group
            matched_group = None
            for group in merged_groups:
                if cls.are_aliases_or_equivalent(
                    cand_name, group["canonicalName"], cand_aliases, group["aliases"]
                ):
                    matched_group = group
                    break

            if matched_group:
                # Add name variant
                matched_group["nameVariants"].append(cand_name)
                # Merge aliases
                for a in cand_aliases:
                    if a and a not in matched_group["aliases"]:
                        matched_group["aliases"].append(a)
                # Keep longer/richer description if new one is better
                new_desc = candidate.get("description", "").strip()
                if len(new_desc) > len(matched_group["description"]):
                    matched_group["description"] = new_desc
                # Merge evidence
                matched_group["evidence"].extend(cand_evidence)
                # If candidate importance is core, upgrade group
                if candidate.get("importance") == "core":
                    matched_group["importance"] = "core"
            else:
                merged_groups.append({
                    "canonicalName": cand_name,
                    "normalizedName": cand_norm,
                    "nameVariants": [cand_name],
                    "type": candidate.get("type", "concept"),
                    "description": candidate.get("description", ""),
                    "importance": candidate.get("importance", "supporting"),
                    "aliases": list(cand_aliases),
                    "evidence": list(cand_evidence),
                })

        # Finalize concepts with canonical names, unique evidence, and importance scores
        final_concepts = []
        for i, group in enumerate(merged_groups):
            temp_id = f"concept_{i + 1}"
            canonical_name = cls.choose_canonical_name(group["nameVariants"])

            # Deduplicate evidence by (sourceId, sourceChunkId, sourceVisualId, pageNumber, slideNumber, startTime)
            unique_evidence = []
            seen_evidence_keys = set()
            distinct_sources = set()

            for ev in group["evidence"]:
                key = (
                    str(ev.get("sourceId")),
                    str(ev.get("sourceChunkId")),
                    str(ev.get("sourceVisualId")),
                    ev.get("pageNumber"),
                    ev.get("slideNumber"),
                    ev.get("startTime"),
                    ev.get("excerpt", "")[:50]
                )
                if key not in seen_evidence_keys:
                    seen_evidence_keys.add(key)
                    unique_evidence.append(ev)
                    if ev.get("sourceId"):
                        distinct_sources.add(str(ev["sourceId"]))

            # Requirement 34: Importance consideration
            # If concept appears across 2+ distinct sources or has 3+ distinct evidence pieces, promote to "core"
            importance = group["importance"]
            if len(distinct_sources) >= 2 or len(unique_evidence) >= 3:
                importance = "core"

            final_concepts.append({
                "tempId": temp_id,
                "name": canonical_name,
                "normalizedName": cls.normalize_name(canonical_name),
                "type": group["type"] if group["type"] in [
                    "topic", "concept", "formula", "method", "definition", 
                    "process", "system", "entity", "principle", "skill", "other"
                ] else "concept",
                "description": group["description"],
                "importance": importance,
                "sourceCount": len(distinct_sources),
                "evidenceCount": len(unique_evidence),
                "aliases": [a for a in group["aliases"] if cls.normalize_name(a) != cls.normalize_name(canonical_name)],
                "evidence": unique_evidence,
                "masteryEligible": True,
            })

        return final_concepts
