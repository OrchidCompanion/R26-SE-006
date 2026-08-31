from unittest.mock import patch

from tests.disease_detection.conftest import PLANT_ID, USER_ID, chain_supabase, seven_day_rows


class TestDiseaseNpkHistoryIntegrationAPI:
    """INTEGRATION TESTS: last-7-day NPK history endpoints used by AnalyseDisease."""

    @patch("routers.disease.supabase")
    def test_npk_history_nested_route(self, mock_sb, client):
        rows = seven_day_rows()
        mock_sb.table.side_effect = chain_supabase(
            {"npk_history": rows, "plants": [{"user_id": USER_ID}]}
        ).table.side_effect

        response = client.get(f"/api/disease/plant/{PLANT_ID}/npk-history")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 7
        assert data["days"] == 7
        assert len(data["data"]) == 7
        assert data["window"]["days_covered"] == 7
        assert data["window"]["sufficient"] is True

    @patch("routers.disease.supabase")
    def test_npk_history_alias_route(self, mock_sb, client):
        mock_sb.table.side_effect = chain_supabase(
            {"npk_history": seven_day_rows(), "plants": [{"user_id": USER_ID}]}
        ).table.side_effect

        response = client.get(f"/api/disease/npk-history/{PLANT_ID}")
        assert response.status_code == 200
        assert response.json()["total"] == 7

    @patch("routers.disease.supabase")
    def test_plant_history_include_npk(self, mock_sb, client):
        mock_sb.table.side_effect = chain_supabase(
            {
                "disease_analysis": [{"analysis_id": "a1", "verdict": "DISEASE"}],
                "npk_history": seven_day_rows(),
                "plants": [{"user_id": USER_ID}],
            },
            count=1,
        ).table.side_effect

        response = client.get(f"/api/disease/plant/{PLANT_ID}?include_npk=true&limit=1")
        assert response.status_code == 200
        data = response.json()
        assert "npk_data" in data
        assert len(data["npk_data"]) == 7
        assert data["npk_window"]["mode"] == "last_7_days"
        assert data["days"] == 7
