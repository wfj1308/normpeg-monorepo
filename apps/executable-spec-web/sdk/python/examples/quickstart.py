from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from normpeg_sdk import NormPegClient


def main() -> None:
    client = NormPegClient(
        base_url="http://localhost:8790",
        role="admin",
        actor_id="demo-python-sdk",
        tenant_id="default",
    )

    # 1) Register spec from markdown.
    register_result = client.register_spec(
        markdown="""
# Demo Spec
input: value
rule: result >= 90
"""
    )
    print("register result:", register_result)

    # 2) Execute.
    execute_result = client.execute(
        {
            "spuId": "demo.spu@v1",
            "containerId": "container_001",
            "inputs": {"value": 95},
        }
    )
    print("execute result:", execute_result)

    # 3) Query proof (container must be archived in workflow).
    proof_result = client.query_proof("container_001")
    print("proof result:", proof_result)


if __name__ == "__main__":
    main()
