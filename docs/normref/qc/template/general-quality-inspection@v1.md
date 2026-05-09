# v://normref.com/qc/template/general-quality-inspection@v1

**Layer 1: Header?????**
- normref_uri: v://normref.com/qc/[?????]@v1
- doc_type: quality-inspection
- jurisdiction: [GB50204 / JTG F80 / SL223 ?]
- industry: highway / bridge / water
- version: v1

**Layer 2: Gate?????**
- required_trip_roles: ["inspector.quality.check", "supervisor.approve"]
- pre_conditions: ["?????", "??????"]
- entry_rules: []

**Layer 3: Body?????**
- basic: { location, component_type, quantity }
- test_data: [{ item, standard, measured, unit, result }]
- relations: [v://...]

**Layer 4: Proof?????**
- signatures: []
- data_hash: sha256
- witness_logs: []
- proof_hash: string

**Layer 5: State?????**
- lifecycle_stage: draft/pending_review/approved/archived
- state_matrix: { total_tables, generated, signed, pending }
- next_action: string
