from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5432/recon"
    aws_region: str = "ap-south-1"
    s3_bucket: str = ""
    dynamodb_table: str = "cash_snapshot"
    sns_topic_arn: str = ""
    ingest_secret: str = "changeme"
    dashboard_token: str = "changeme"

    # Matching thresholds (config constants — tune live for demo)
    auto_match_min: float = 85.0
    review_min: float = 60.0
    ambiguity_margin: float = 5.0

    class Config:
        env_file = ".env"


settings = Settings()
