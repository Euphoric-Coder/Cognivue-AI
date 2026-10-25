import logging
from typing import List, Dict, Any, Tuple, Set

logger = logging.getLogger(__name__)

class GraphValidator:
    """
    Validates graph consistency, evidence integrity, deduplicates edges,
    and detects / resolves prerequisite cycles.
    """

    @classmethod
    def validate_and_sanitize(
        cls,
        concepts: List[Dict[str, Any]],
        relationships: List[Dict[str, Any]],
        evidence: List[Dict[str, Any]]
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]], List[str]]:
        """
        Validates graph structure, enforces evidence presence,
        breaks prerequisite cycles, and returns sanitized data + validation warnings.
        """
        warnings: List[str] = []

        # 1. Ensure concepts have valid tempIds
        concept_ids = {c["tempId"] for c in concepts}
        valid_concepts = []
        valid_concept_ids = set()

        # Map concept tempId to evidence items count
        evidence_by_concept: Dict[str, List[Dict[str, Any]]] = {}
        for ev in evidence:
            cid = ev.get("conceptTempId")
            if cid:
                evidence_by_concept.setdefault(cid, []).append(ev)

        for c in concepts:
            cid = c["tempId"]
            # Ensure concept has at least one evidence item
            ev_list = evidence_by_concept.get(cid, [])
            if not ev_list and not c.get("evidence"):
                warnings.append(f"CONCEPT_DROPPED_NO_EVIDENCE: '{c['name']}' has no supporting evidence.")
                continue

            valid_concepts.append(c)
            valid_concept_ids.add(cid)

        # 2. Filter evidence linked to valid concepts
        valid_evidence = []
        for ev in evidence:
            cid = ev.get("conceptTempId")
            if cid in valid_concept_ids:
                valid_evidence.append(ev)

        # 3. Validate relationships
        valid_relationships = []
        seen_edges: Set[Tuple[str, str, str]] = set()

        for rel in relationships:
            from_id = rel.get("fromTempId")
            to_id = rel.get("toTempId")
            rel_type = rel.get("relationType", "RELATED_TO").upper()

            # Self-edge check
            if from_id == to_id:
                warnings.append(f"SELF_EDGE_REMOVED: concept '{from_id}' links to itself.")
                continue

            # Existence check
            if from_id not in valid_concept_ids or to_id not in valid_concept_ids:
                warnings.append(f"DANGLING_EDGE_REMOVED: ({from_id} -> {to_id}) references missing concept.")
                continue

            # Duplicate edge check
            edge_key = (from_id, to_id, rel_type)
            if edge_key in seen_edges:
                continue
            seen_edges.add(edge_key)

            valid_relationships.append(rel)

        # 4. Prerequisite cycle detection and resolution
        sanitized_relationships = cls._detect_and_resolve_prerequisite_cycles(
            valid_concepts, valid_relationships, warnings
        )

        return valid_concepts, sanitized_relationships, valid_evidence, warnings

    @classmethod
    def _detect_and_resolve_prerequisite_cycles(
        cls,
        concepts: List[Dict[str, Any]],
        relationships: List[Dict[str, Any]],
        warnings: List[str]
    ) -> List[Dict[str, Any]]:
        """
        Detects cycles in PREREQUISITE_OF and DEPENDS_ON relations.
        If a cycle is detected, logs KNOWLEDGE_GRAPH_PREREQUISITE_CYCLE
        and downgrades cyclic edges to RELATED_TO.
        """
        # Map concept ID to name for legible logging
        name_map = {c["tempId"]: c["name"] for c in concepts}

        # Build adjacency list for prerequisite/dependency relations
        # For uniformity, consider A PREREQUISITE_OF B as edge A -> B,
        # and B DEPENDS_ON A as edge A -> B.
        adj: Dict[str, List[Tuple[str, int]]] = {}
        for idx, rel in enumerate(relationships):
            rtype = rel["relationType"]
            if rtype == "PREREQUISITE_OF":
                adj.setdefault(rel["fromTempId"], []).append((rel["toTempId"], idx))
            elif rtype == "DEPENDS_ON":
                adj.setdefault(rel["toTempId"], []).append((rel["fromTempId"], idx))

        # Standard cycle detection in directed graph using DFS
        visited = {} # tempId -> state: 0=unvisited, 1=visiting, 2=visited
        edge_to_downgrade = set()

        def dfs(node: str, path: List[str], path_edges: List[int]) -> bool:
            visited[node] = 1 # visiting
            for neighbor, edge_idx in adj.get(node, []):
                if visited.get(neighbor) == 1:
                    # Found a cycle!
                    cycle_nodes = path + [node, neighbor]
                    cycle_names = [name_map.get(n, n) for n in cycle_nodes]
                    cycle_str = " -> ".join(cycle_names)
                    logger.warning(f"KNOWLEDGE_GRAPH_PREREQUISITE_CYCLE\ncycle={cycle_str}")
                    warnings.append(f"KNOWLEDGE_GRAPH_PREREQUISITE_CYCLE: {cycle_str}")
                    # Mark the edge closing the cycle for downgrade to RELATED_TO
                    edge_to_downgrade.add(edge_idx)
                    return True
                elif visited.get(neighbor) != 2:
                    if dfs(neighbor, path + [node], path_edges + [edge_idx]):
                        return True
            visited[node] = 2 # fully processed
            return False

        for c in concepts:
            cid = c["tempId"]
            if visited.get(cid) != 2:
                dfs(cid, [], [])

        # Downgrade cyclic prerequisite edges to RELATED_TO
        sanitized = []
        for idx, rel in enumerate(relationships):
            if idx in edge_to_downgrade:
                downgraded = dict(rel)
                downgraded["relationType"] = "RELATED_TO"
                downgraded["explanation"] = f"{rel.get('explanation', '')} (Note: prerequisite converted to related_to to prevent dependency cycle)"
                sanitized.append(downgraded)
            else:
                sanitized.append(rel)

        return sanitized
