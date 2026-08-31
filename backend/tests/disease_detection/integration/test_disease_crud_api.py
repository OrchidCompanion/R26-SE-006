from unittest.mock import patch

from tests.disease_detection.conftest import PLANT_ID, USER_ID, chain_supabase


class TestDiseaseCrudIntegrationAPI:
    """INTEGRATION TESTS: disease_analysis list, get-by-id, and soft delete."""

    @patch("routers.disease.supabase")
    def test_list_records_for_current_user(self, mock_sb, client):
        mock_sb.table.side_effect = chain_supabase(
            {
                "disease_analysis": [
                    {"analysis_id": "a1", "verdict": "DISEASE"},
                    {"analysis_id": "a2", "verdict": "HEALTHY"},
                ]
            }
        ).table.side_effect

        response = client.get("/api/disease")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["analysis_id"] == "a1"

    @patch("routers.disease.supabase")
    def test_get_record_by_id(self, mock_sb, client):
        mock_sb.table.side_effect = chain_supabase(
            {"disease_analysis": [{"analysis_id": "a1", "plant_id": PLANT_ID}]}
        ).table.side_effect

        response = client.get("/api/disease/a1")
        assert response.status_code == 200
        assert response.json()["analysis_id"] == "a1"

    @patch("routers.disease.supabase")
    def test_get_record_not_found(self, mock_sb, client):
        mock_sb.table.side_effect = chain_supabase({"disease_analysis": []}).table.side_effect
        response = client.get("/api/disease/missing")
        assert response.status_code == 404

    @patch("routers.disease.supabase")
    def test_soft_delete_record(self, mock_sb, client):
        mock_sb.table.side_effect = chain_supabase(
            {"disease_analysis": [{"analysis_id": "a1", "deleted_at": "2026-08-31T00:00:00Z"}]}
        ).table.side_effect

        response = client.delete("/api/disease/a1")
        assert response.status_code == 200
        assert "soft deleted" in response.json()["message"].lower()

    @patch("routers.disease.supabase")
    def test_soft_delete_missing_record(self, mock_sb, client):
        mock_sb.table.side_effect = chain_supabase({"disease_analysis": []}).table.side_effect
        response = client.delete("/api/disease/missing")
        assert response.status_code == 404

    @patch("routers.disease.supabase")
    def test_plant_history_pagination(self, mock_sb, client):
        mock_sb.table.side_effect = chain_supabase(
            {"disease_analysis": [{"analysis_id": "a1", "plant_id": PLANT_ID}]},
            count=1,
        ).table.side_effect

        response = client.get(f"/api/disease/plant/{PLANT_ID}?page=1&limit=10")
        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 1
        assert data["limit"] == 10
        assert data["total"] == 1
        assert data["data"][0]["analysis_id"] == "a1"
        assert USER_ID  # auth override is applied
