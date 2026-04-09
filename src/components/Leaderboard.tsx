import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { fetchLeaderboard, fetchUserEarnings } from "../utils/graphql";

interface SlowPeriod {
  count: number;
  amount: string;
  cost_basis: string;
}

interface FastPeriod {
  count: number;
  amount: string;
  cost_basis: string;
}

interface LeaderboardEntry {
  key: string;
  value: {
    lastUpdated: number;
    slowPeriods: Record<string, SlowPeriod>;
    fastPeriods?: Record<string, FastPeriod>;
  };
  totalAmount?: number;
  totalCostBasis?: number;
  profit?: number;
  latestWeekProfit?: number;
  totalRank?: number;
  latestWeekRank?: number;
}

interface UserEarningsEntry {
  key: string;
  value: {
    lastUpdated: number;
    slowPeriods: Record<string, SlowPeriod>;
    fastPeriods: Record<string, FastPeriod>;
  };
}

const Leaderboard = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchedEntry, setSearchedEntry] = useState<LeaderboardEntry | null>(
    null,
  );
  const [userEarnings, setUserEarnings] = useState<UserEarningsEntry | null>(
    null,
  );
  const [inputPage, setInputPage] = useState("");
  const [searchView, setSearchView] = useState<"latest" | "total">("latest");
  const [rankingView, setRankingView] = useState<"total" | number>("total");
  const itemsPerPage = 100;

  const {
    data: leaderboard,
    isLoading,
    isError,
    error,
  } = useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboard"],
    queryFn: fetchLeaderboard,
    refetchInterval: 10 * 60 * 1000,
  });

  // Find the latest week
  const latestWeek = useMemo(() => {
    if (!leaderboard || leaderboard.length === 0) return null;
    let maxWeek = 0;
    leaderboard.forEach((entry) => {
      Object.keys(entry.value.slowPeriods).forEach((week) => {
        const weekNum = parseInt(week);
        if (weekNum > maxWeek) maxWeek = weekNum;
      });
    });
    return maxWeek;
  }, [leaderboard]);

  // Calculate total profit and latest week profit, and add rankings
  const processedData = useMemo(() => {
    if (!leaderboard) {
      return [];
    }

    // First, calculate profits for all entries
    const withProfits = leaderboard.map((entry) => {
      let totalAmount = 0;
      let totalCostBasis = 0;
      let latestWeekProfit = 0;

      // Calculate total profit
      const slowPeriods = entry.value?.slowPeriods;
      if (slowPeriods && typeof slowPeriods === "object") {
        Object.entries(slowPeriods).forEach(([week, period]: [string, any]) => {
          if (period && period.amount && period.cost_basis) {
            const weekProfit =
              parseFloat(period.amount) - parseFloat(period.cost_basis);
            totalAmount += parseFloat(period.amount) || 0;
            totalCostBasis += parseFloat(period.cost_basis) || 0;

            // Calculate latest week profit
            if (latestWeek !== null && parseInt(week) === latestWeek) {
              latestWeekProfit = weekProfit;
            }
          }
        });
      }

      return {
        ...entry,
        totalAmount,
        totalCostBasis,
        profit: totalAmount - totalCostBasis,
        latestWeekProfit,
      };
    });

    // Sort by total profit and add total rank
    const sortedByTotal = [...withProfits].sort((a, b) => b.profit - a.profit);
    const withTotalRank = sortedByTotal.map((entry, index) => ({
      ...entry,
      totalRank: index + 1,
    }));

    // Sort by latest week profit and add latest week rank
    const sortedByLatestWeek = [...withProfits].sort(
      (a, b) => (b.latestWeekProfit || 0) - (a.latestWeekProfit || 0),
    );
    const withLatestWeekRank = sortedByLatestWeek.map((entry, index) => ({
      ...entry,
      latestWeekRank: index + 1,
    }));

    // Merge rankings back
    const rankMap = new Map();
    withTotalRank.forEach((entry) => {
      rankMap.set(entry.key, { totalRank: entry.totalRank });
    });
    withLatestWeekRank.forEach((entry) => {
      const existing = rankMap.get(entry.key) || {};
      rankMap.set(entry.key, {
        ...existing,
        latestWeekRank: entry.latestWeekRank,
      });
    });

    // Return with both rankings
    return withProfits.map((entry) => ({
      ...entry,
      totalRank: rankMap.get(entry.key)?.totalRank,
      latestWeekRank: rankMap.get(entry.key)?.latestWeekRank,
    }));
  }, [leaderboard, latestWeek]);

  // Get all available weeks
  const availableWeeks = useMemo(() => {
    if (!leaderboard) return [];
    const weeks = new Set<number>();
    leaderboard.forEach((entry) => {
      Object.keys(entry.value.slowPeriods).forEach((week) => {
        weeks.add(parseInt(week));
      });
    });
    return Array.from(weeks).sort((a, b) => a - b);
  }, [leaderboard]);

  // Calculate profit for a specific week
  const getWeekProfit = (entry: LeaderboardEntry, week: number) => {
    const period = entry.value.slowPeriods[week];
    if (period && period.amount && period.cost_basis) {
      return parseFloat(period.amount) - parseFloat(period.cost_basis);
    }
    return 0;
  };

  // Sort data based on selected ranking view
  const sortedLeaderboard = useMemo(() => {
    if (rankingView === "total") {
      return [...processedData].sort((a, b) => b.profit - a.profit);
    } else {
      // Sort by specific week profit
      return [...processedData].sort(
        (a, b) => getWeekProfit(b, rankingView) - getWeekProfit(a, rankingView),
      );
    }
  }, [processedData, rankingView]);

  // Search for user
  const handleSearch = async () => {
    if (!searchQuery.trim() || !sortedLeaderboard) {
      setSearchedEntry(null);
      setUserEarnings(null);
      return;
    }

    const query = searchQuery.toLowerCase().trim();

    // 检查是否包含该地址（部分匹配）
    const matchingEntries = sortedLeaderboard.filter((entry) =>
      entry.key.toLowerCase().includes(query),
    );

    // 使用包含匹配
    const found = matchingEntries[0] || null;

    setSearchedEntry(found);

    // 如果找到匹配项，查询该地址的详细收益数据
    if (found) {
      try {
        const earningsData = await fetchUserEarnings(found.key);
        if (earningsData) {
          setUserEarnings(earningsData as UserEarningsEntry);
        }
      } catch (err) {
        console.error("Failed to fetch user earnings:", err);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchedEntry(null);
    setUserEarnings(null);
  };

  // Pagination logic
  const totalItems = sortedLeaderboard?.length || 0;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = sortedLeaderboard?.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setInputPage("");
  };

  const handleInputPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputPage(e.target.value);
  };

  const handleGoToPage = () => {
    const page = parseInt(inputPage);
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      setInputPage("");
    }
  };

  const handleInputKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleGoToPage();
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-64">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mb-4"></div>
        <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
          Loading Leaderboard Data...
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          Please wait while we fetch the latest data
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">Failed to load leaderboard</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          onClick={() => window.location.reload()}
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Ranking View Selector */}
      <div className="flex justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 flex items-center gap-4">
          <label className="text-gray-700 dark:text-gray-300 font-medium">
            Ranking:
          </label>
          <select
            value={rankingView === "total" ? "total" : rankingView.toString()}
            onChange={(e) => {
              const value = e.target.value;
              if (value === "total") {
                setRankingView("total");
              } else {
                setRankingView(parseInt(value));
              }
              setCurrentPage(1);
            }}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all min-w-[180px]"
          >
            <option value="total">Total Ranking</option>
            {availableWeeks.map((week) => (
              <option key={week} value={week}>
                Week {week + 1} Ranking
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Search Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="flex-1 w-full">
            <input
              type="text"
              placeholder="Search by address (e.g., 0xa091...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSearch}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              Search
            </button>
            {searchedEntry && (
              <button
                onClick={clearSearch}
                className="px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Search Results */}
        {searchedEntry && (
          <div className="mt-6 border-t dark:border-gray-700 pt-6">
            <div className="flex justify-center gap-4 mb-4">
              <button
                onClick={() => setSearchView("latest")}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  searchView === "latest"
                    ? "bg-gradient-to-r from-green-500 to-teal-500 text-white shadow-md"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                Latest Week Rank #{searchedEntry.latestWeekRank}
              </button>
              <button
                onClick={() => setSearchView("total")}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  searchView === "total"
                    ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-md"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                Total Rank #{searchedEntry.totalRank}
              </button>
            </div>

            <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">
              User Details
            </h3>
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    Address
                  </p>
                  <p className="font-mono text-sm break-all">
                    {searchedEntry.key}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    Last Updated
                  </p>
                  <p className="font-medium">
                    {new Date(
                      searchedEntry.value.lastUpdated / 1000,
                    ).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center shadow-sm">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    Total Amount
                  </p>
                  <p className="text-xl font-bold text-blue-600">
                    {searchedEntry.totalAmount?.toFixed(4)}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center shadow-sm">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    Total Cost
                  </p>
                  <p className="text-xl font-bold text-gray-700 dark:text-gray-300">
                    {searchedEntry.totalCostBasis?.toFixed(4)}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center shadow-sm">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    Total Profit
                  </p>
                  <p
                    className={`text-xl font-bold ${(searchedEntry.profit || 0) >= 0 ? "text-green-500" : "text-red-500"}`}
                  >
                    {(searchedEntry.profit || 0) >= 0 ? "+" : ""}
                    {searchedEntry.profit?.toFixed(4)}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center shadow-sm">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    Latest Week Profit
                  </p>
                  <p
                    className={`text-xl font-bold ${(searchedEntry.latestWeekProfit || 0) >= 0 ? "text-green-500" : "text-red-500"}`}
                  >
                    {(searchedEntry.latestWeekProfit || 0) >= 0 ? "+" : ""}
                    {(searchedEntry.latestWeekProfit || 0).toFixed(4)}
                  </p>
                </div>
              </div>

              {/* Breakdown Section - Side by Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Weekly Breakdown */}
                <div>
                  <h4 className="text-md font-semibold mb-3 text-gray-700 dark:text-gray-300">
                    Weekly Breakdown
                  </h4>
                  <div className="max-h-[385px] overflow-y-auto pr-2 space-y-3">
                    {Object.entries(searchedEntry.value.slowPeriods)
                      .sort(
                        ([weekA], [weekB]) => parseInt(weekB) - parseInt(weekA),
                      ) // 倒序排序
                      .map(([week, period]) => {
                        // 计算该周的收益
                        const weekProfit =
                          parseFloat(period.amount) -
                          parseFloat(period.cost_basis);

                        // 计算该周所有用户的收益并排序
                        const weekUsers = leaderboard
                          ?.map((entry) => {
                            const userPeriod = entry.value.slowPeriods[week];
                            if (userPeriod) {
                              return {
                                key: entry.key,
                                profit:
                                  parseFloat(userPeriod.amount) -
                                  parseFloat(userPeriod.cost_basis),
                              };
                            }
                            return null;
                          })
                          .filter(Boolean) as Array<{
                          key: string;
                          profit: number;
                        }>;

                        // 排序用户
                        weekUsers?.sort((a, b) => b.profit - a.profit);

                        // 计算当前用户的排名
                        const userRank =
                          weekUsers?.findIndex(
                            (u) => u.key === searchedEntry.key,
                          ) + 1 || 0;
                        const totalUsers = weekUsers?.length || 1;
                        const rankPercentage =
                          totalUsers > 0 ? (userRank / totalUsers) * 100 : 0;

                        // 确定排名等级
                        let rankLevel = "";
                        if (rankPercentage <= 1) rankLevel = "Top 1%";
                        else if (rankPercentage <= 5) rankLevel = "Top 5%";
                        else if (rankPercentage <= 20) rankLevel = "Top 20%";
                        else if (rankPercentage <= 50) rankLevel = "Top 50%";
                        else rankLevel = "Below 50%";

                        return (
                          <div
                            key={week}
                            className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm"
                          >
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                                Week {parseInt(week) + 1}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">
                                  Count: {period.count}
                                </span>
                                <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
                                  Rank: #{userRank}
                                </span>
                                <span
                                  className={`text-xs font-medium ${rankPercentage <= 1 ? "text-yellow-500" : rankPercentage <= 5 ? "text-orange-500" : rankPercentage <= 20 ? "text-green-500" : "text-gray-500"}`}
                                >
                                  {rankLevel}
                                </span>
                              </div>
                            </div>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-500">Amount:</span>
                                <span className="font-medium">
                                  {parseFloat(period.amount).toFixed(4)}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Cost:</span>
                                <span className="font-medium">
                                  {parseFloat(period.cost_basis).toFixed(4)}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Profit:</span>
                                <span
                                  className={`font-medium ${weekProfit >= 0 ? "text-green-500" : "text-red-500"}`}
                                >
                                  {weekProfit >= 0 ? "+" : ""}
                                  {weekProfit.toFixed(4)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Daily Breakdown (Fast Periods) */}
                {userEarnings?.value?.fastPeriods &&
                  Object.keys(userEarnings.value.fastPeriods).length > 0 && (
                    <div>
                      <h4 className="text-md font-semibold mb-3 text-gray-700 dark:text-gray-300">
                        Daily Breakdown
                      </h4>
                      <div className="max-h-[385px] overflow-y-auto pr-2 space-y-3">
                        {Object.entries(userEarnings.value.fastPeriods)
                          .sort(
                            ([dayA], [dayB]) => parseInt(dayB) - parseInt(dayA),
                          ) // 倒序排序
                          .map(([day, period]) => (
                            <div
                              key={day}
                              className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border-l-4 border-green-500"
                            >
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-medium text-green-600 dark:text-green-400">
                                  Day {parseInt(day) + 1}
                                </span>
                                <span className="text-xs text-gray-500">
                                  Count: {period.count}
                                </span>
                              </div>
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Amount:</span>
                                  <span className="font-medium">
                                    {parseFloat(period.amount).toFixed(4)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Cost:</span>
                                  <span className="font-medium">
                                    {parseFloat(period.cost_basis).toFixed(4)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Profit:</span>
                                  <span
                                    className={`font-medium ${parseFloat(period.amount) - parseFloat(period.cost_basis) >= 0 ? "text-green-500" : "text-red-500"}`}
                                  >
                                    {parseFloat(period.amount) -
                                      parseFloat(period.cost_basis) >=
                                    0
                                      ? "+"
                                      : ""}
                                    {(
                                      parseFloat(period.amount) -
                                      parseFloat(period.cost_basis)
                                    ).toFixed(4)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Leaderboard Table */}
      <div className="overflow-x-auto rounded-xl shadow-lg">
        <table className="min-w-full bg-white dark:bg-gray-800 rounded-xl overflow-hidden">
          <thead className="bg-gradient-to-r from-blue-500 to-purple-500 text-white">
            <tr>
              <th className="px-6 py-4 text-left font-semibold">#</th>
              <th className="px-6 py-4 text-left font-semibold">Address</th>
              <th className="px-6 py-4 text-right font-semibold">
                Total Amount
              </th>
              <th className="px-6 py-4 text-right font-semibold">
                Total Cost Basis
              </th>
              <th className="px-6 py-4 text-right font-semibold">
                {rankingView === "total"
                  ? "Total Profit"
                  : `Week ${rankingView + 1} Profit`}
              </th>
              <th className="px-6 py-4 text-right font-semibold">
                Last Updated
              </th>
            </tr>
          </thead>
          <tbody>
            {currentItems?.map((entry: LeaderboardEntry, index: number) => {
              const rank = startIndex + index + 1;
              const displayProfit =
                rankingView === "total"
                  ? entry.profit
                  : getWeekProfit(entry, rankingView);
              return (
                <tr
                  key={entry.key}
                  className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <td className="px-6 py-4 font-medium">{rank}</td>
                  <td className="px-6 py-4 font-mono text-sm truncate max-w-xs">
                    {entry.key.substring(0, 10)}...
                    {entry.key.substring(entry.key.length - 6)}
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-medium">
                    {entry.totalAmount?.toFixed(4)}
                  </td>
                  <td className="px-6 py-4 text-right font-mono">
                    {entry.totalCostBasis?.toFixed(4)}
                  </td>
                  <td
                    className={`px-6 py-4 text-right font-mono font-medium ${(displayProfit || 0) >= 0 ? "text-green-500" : "text-red-500"}`}
                  >
                    {(displayProfit || 0) >= 0 ? "+" : ""}
                    {(displayProfit || 0).toFixed(4)}
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-gray-600 dark:text-gray-400">
                    {new Date(entry.value.lastUpdated / 1000).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col items-center gap-4 mt-8">
          {/* Page Navigation */}
          <div className="flex justify-center items-center">
            <nav className="inline-flex rounded-lg shadow-md">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-4 py-2 rounded-l-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNumber;
                if (totalPages <= 5) {
                  pageNumber = i + 1;
                } else if (currentPage <= 3) {
                  pageNumber = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNumber = totalPages - 4 + i;
                } else {
                  pageNumber = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNumber}
                    onClick={() => handlePageChange(pageNumber)}
                    className={`px-4 py-2 border-t border-b ${currentPage === pageNumber ? "bg-gradient-to-r from-blue-500 to-purple-500 border-blue-500 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"} transition-colors`}
                  >
                    {pageNumber}
                  </button>
                );
              })}

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-4 py-2 rounded-r-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </nav>
            <div className="ml-4 text-sm text-gray-600 dark:text-gray-400 font-medium">
              Page {currentPage} of {totalPages}
            </div>
          </div>

          {/* Go to Page Input */}
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800 px-4 py-2 rounded-lg shadow-md">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Go to page:
            </span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={inputPage}
              onChange={handleInputPageChange}
              onKeyPress={handleInputKeyPress}
              placeholder="1"
              className="w-16 px-2 py-1 text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
            />
            <button
              onClick={handleGoToPage}
              disabled={
                !inputPage ||
                parseInt(inputPage) < 1 ||
                parseInt(inputPage) > totalPages
              }
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-medium rounded transition-colors"
            >
              Go
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Leaderboard;
