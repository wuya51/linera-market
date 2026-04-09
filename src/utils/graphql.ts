// GraphQL API endpoint
const API_ENDPOINT =
  "https://00685068-3c46-44ed-89f1-8cce1224da2a.worker.infra.linera.net/chains/192907fcb85eec2b071f30a097c9152bd6a108486592ab52b53a80e01eaab304/applications/466b0ffc0ba4eeab34a2ff74b4a64e7a88c135ade58bed630ff600f62744d1d6";

// 模拟数据
const mockMarketData = [
  {
    id: "1",
    name: "Linera",
    symbol: "LIN",
    price: 1.25,
    volume24h: 125000000,
    change24h: 2.5,
  },
  {
    id: "2",
    name: "Ethereum",
    symbol: "ETH",
    price: 3200.5,
    volume24h: 1500000000,
    change24h: -0.5,
  },
  {
    id: "3",
    name: "Bitcoin",
    symbol: "BTC",
    price: 60000.0,
    volume24h: 2500000000,
    change24h: 1.2,
  },
  {
    id: "4",
    name: "Solana",
    symbol: "SOL",
    price: 100.75,
    volume24h: 500000000,
    change24h: 3.8,
  },
  {
    id: "5",
    name: "Polkadot",
    symbol: "DOT",
    price: 8.25,
    volume24h: 100000000,
    change24h: -1.5,
  },
];

const mockRankings = [
  {
    id: "1",
    name: "Linera",
    symbol: "LIN",
    rank: 1,
    marketCap: 12500000000,
    volume24h: 125000000,
  },
  {
    id: "2",
    name: "Ethereum",
    symbol: "ETH",
    rank: 2,
    marketCap: 380000000000,
    volume24h: 1500000000,
  },
  {
    id: "3",
    name: "Bitcoin",
    symbol: "BTC",
    rank: 3,
    marketCap: 1150000000000,
    volume24h: 2500000000,
  },
  {
    id: "4",
    name: "Solana",
    symbol: "SOL",
    rank: 4,
    marketCap: 45000000000,
    volume24h: 500000000,
  },
  {
    id: "5",
    name: "Polkadot",
    symbol: "DOT",
    rank: 5,
    marketCap: 8500000000,
    volume24h: 100000000,
  },
  {
    id: "6",
    name: "Cardano",
    symbol: "ADA",
    rank: 6,
    marketCap: 7800000000,
    volume24h: 95000000,
  },
];

// 通用 GraphQL 请求函数
async function graphqlRequest<T>(query: string): Promise<T> {
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
      throw new Error(data.errors.map((err: any) => err.message).join(", "));
    }

    return data.data as T;
  } catch (error) {
    console.error("GraphQL request error:", error);
    // 如果真实 API 调用失败，使用模拟数据作为后备
    console.log("Using mock data as fallback");
    return new Promise((resolve) => {
      setTimeout(() => {
        if (query.includes("marketData")) {
          resolve(mockMarketData as unknown as T);
        } else if (query.includes("rankings")) {
          resolve(mockRankings as unknown as T);
        } else {
          resolve({} as T);
        }
      }, 500); // 模拟网络延迟
    });
  }
}

// 查询市场数据
export async function fetchMarketData() {
  const query = `
    query MarketData {
      marketData {
        id
        name
        symbol
        price
        volume24h
        change24h
      }
    }
  `;
  return graphqlRequest<any[]>(query);
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
          }
        }
      }
    }
  `;
  const data = await graphqlRequest<any>(query);
  console.log("Raw leaderboard data:", data);

  // 检查数据结构
  if (data.reports && data.reports.entries) {
    console.log("Entries count:", data.reports.entries.length);
    console.log("First entry:", data.reports.entries[0]);
    return data.reports.entries;
  }

  console.error("Unexpected data structure:", data);
  return [];
}

// 查询排名数据
export async function fetchRankings() {
  const query = `
    query Rankings {
      rankings {
        id
        name
        symbol
        rank
        marketCap
        volume24h
      }
    }
  `;
  return graphqlRequest<any[]>(query);
}

// 查询指定地址的收益数据
export async function fetchUserEarnings(address: string) {
  const query = `
    query GetMyEarnings {
      reports {
        entry(key: "${address}") {
          key
          value {
            lastUpdated
            fastPeriods
            slowPeriods
          }
        }
      }
    }
  `;
  const data = await graphqlRequest<any>(query);
  console.log("User earnings data:", data);

  if (data.reports && data.reports.entry) {
    return data.reports.entry;
  }

  return null;
}
