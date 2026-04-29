// scripts/sync-to-r2.js
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
const API_ENDPOINT =
  "https://00685068-3c46-44ed-89f1-8cce1224da2a.worker.infra.linera.net/chains/192907fcb85eec2b071f30a097c9152bd6a108486592ab52b53a80e01eaab304/applications/466b0ffc0ba4eeab34a2ff74b4a64e7a88c135ade58bed630ff600f62744d1d6";

// 配置 R2 客户端（S3 兼容模式）
const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.cloudflarestorage.com/linera-market-reports`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
// 通用 GraphQL 请求函数
async function graphqlRequest(query) {
  try {
    // 使用真实的 API 端点
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status}`);
    }

    const data = await response.json();
    console.log("GraphQL response:", data);

    if (data.errors) {
      throw new Error(data.errors.map((err) => err.message).join(", "));
    }

    return data.data;
  } catch (error) {
    console.error("GraphQL request error:", error);
  }
}

// 查询排行榜数据
export async function fetchLeaderboard() {
  const query = `
    query GetLeaderboard {
      reports {
        entries(input: {}) {
          key
          value {
            lastUpdated
            slowPeriods
            fastPeriods
          }
        }
      }
    }
  `;
  return await graphqlRequest(query);
}
async function syncData() {
  try {
    // 1. 从第三方接口拉取数据
    const response = await fetchLeaderboard();

    // 2. 上传到 R2（覆盖写入）
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: "data/leadboard_reports.json", // 固定文件名
      Body: JSON.stringify(response),
      ContentType: "application/json",
      CacheControl: "max-age=600, stale-while-revalidate=300", // CDN 缓存策略
    });

    await r2Client.send(command);
  } catch (error) {
    process.exit(1);
  }
}

syncData();
