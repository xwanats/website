import BigNumber from "bignumber.js";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getDebugSearchParam } from "../browserOnly";
import {
  RESULTS_TITLE,
  REWARD_EARLY_BIRD_HOURS,
  REWARD_EARLY_BIRD_HOURS_EXT,
  START_DATE,
  CROWDLOAN_STARTED,
  REWARDS_BUDGET,
} from "../config";

import { CrowdloanPhase, DOT_PLANCK, PARACHAIN_NAME } from "../const";
import { getTotalRaised } from "../getTotalRaised";
import { usePolkadotApi } from "./PolkadotApiProvider";

const INTERVAL_UPDATE_COUNTERS_MS = 1000; // update counters every second
const INTERVAL_UPDATE_BASE_REWARD_MS = 1000 * 60 * 15; // update base reward every 15 minutes

const AUCTION_START_DATE = new Date(START_DATE);

const EARLY_BIRD_END_DATE = new Date(
  AUCTION_START_DATE.getTime() + REWARD_EARLY_BIRD_HOURS * 60 * 60 * 1000
);

const EARLY_BIRD_EXTENDED_END_DATE = new Date(
  EARLY_BIRD_END_DATE.getTime() + REWARD_EARLY_BIRD_HOURS_EXT * 60 * 60 * 1000
);

const getDaysUntilAuction = () =>
  Math.ceil((AUCTION_START_DATE.getTime() - Date.now()) / 1000 / 60 / 60 / 24);

const getIsAuctionStarted = () => CROWDLOAN_STARTED;

const getEarlyBirdHoursLeft = () => {
  const endDate =
    getCrowdloanPhase() === "earlyBird"
      ? EARLY_BIRD_END_DATE
      : EARLY_BIRD_EXTENDED_END_DATE;

  return Math.ceil((endDate.getTime() - Date.now()) / 1000 / 60 / 60);
};

const getIsEarlyBird = () =>
  getCrowdloanPhase() === "earlyBird" ||
  getCrowdloanPhase() === "earlyBirdExtended";

const getCrowdloanPhase = (): CrowdloanPhase => {
  const debugPhase = getDebugSearchParam("debugPhase");
  if (debugPhase) {
    return debugPhase as CrowdloanPhase;
  }
  if (RESULTS_TITLE) return "ended";
  if (!CROWDLOAN_STARTED) return "notStarted";

  if (CROWDLOAN_STARTED && Date.now() < EARLY_BIRD_END_DATE.getTime())
    return "earlyBird";

  if (CROWDLOAN_STARTED && Date.now() < EARLY_BIRD_EXTENDED_END_DATE.getTime())
    return "earlyBirdExtended";

  return "earlyBirdExpired";
};

type AuctionContextType = {
  auctionStartDate: Date;
  daysUntilAuction: number;
  isAuctionStarted: boolean;
  isEarlyBird: boolean;
  earlyBirdHoursLeft: number;
  crowdloanPhase: CrowdloanPhase;
  totalRaised?: number;
  totalContributions?: number;
  baseRewardRate?: number;
};

const AuctionContext = createContext<AuctionContextType>({
  auctionStartDate: AUCTION_START_DATE,
  daysUntilAuction: 1,
  isAuctionStarted: false,
  isEarlyBird: false,
  earlyBirdHoursLeft: 0,
  crowdloanPhase: "notStarted",
  totalRaised: undefined,
  totalContributions: undefined,
  baseRewardRate: undefined,
});

export const AuctionContextProvider: React.FC = ({ children }) => {
  const [daysUntilAuction, setDaysUntilAuction] = useState<number>(
    getDaysUntilAuction()
  );
  const [earlyBirdHoursLeft, setEarlyBirdHoursLeft] = useState<number>(
    getEarlyBirdHoursLeft()
  );
  const [isAuctionStarted, setIsAuctionStarted] = useState<boolean>(
    getIsAuctionStarted()
  );

  const [isEarlyBird, setIsEarlyBird] = useState<boolean>(getIsEarlyBird());
  const [crowdloanPhase, setCrowdloanPhase] = useState<CrowdloanPhase>(
    getCrowdloanPhase()
  );

  const [totalRaised, setTotalRaised] = useState<number>();
  const [totalContributions, setTotalContributions] = useState<number>();

  const baseRewardRate = useMemo<number>(
    () => (totalRaised ? REWARDS_BUDGET / totalRaised : 0),
    [totalRaised]
  );

  useEffect(() => {
    const intervalId = setInterval(() => {
      setDaysUntilAuction(getDaysUntilAuction());
      setEarlyBirdHoursLeft(getEarlyBirdHoursLeft());
      setIsAuctionStarted(getIsAuctionStarted());
      setIsEarlyBird(getIsEarlyBird());
      setCrowdloanPhase(getCrowdloanPhase());
    }, INTERVAL_UPDATE_COUNTERS_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  // data depending on polkadot API

  const { api } = usePolkadotApi();

  useEffect(() => {
    const updateBaseReward = () => {
      fetch(
        "/.netlify/functions/getCentrifugeTotalContributions" +
          `?parachain=${PARACHAIN_NAME}`
      )
        .then((r) => r.json())
        .then((data) => {
          setTotalContributions(data.numberOfContributions);
          const totalRaisedNum = new BigNumber(data.totalStaked)
            .div(DOT_PLANCK)
            .toNumber();
          setTotalRaised(totalRaisedNum);
          // console.log("total raised", totalRaisedNum);
          // console.log("base reward rate", REWARDS_BUDGET / totalRaisedNum);
        })
        // backup if lambda fails
        .catch(() =>
          api
            ? getTotalRaised(api).then((total) => {
                setTotalRaised(total);
              })
            : null
        );
    };

    updateBaseReward();

    // repeat every 15 minutes
    const intervalId = setInterval(
      updateBaseReward,
      INTERVAL_UPDATE_BASE_REWARD_MS
    );

    return () => {
      clearInterval(intervalId);
    };
  }, [api]);

  const ctx: AuctionContextType = useMemo<AuctionContextType>(
    () => ({
      auctionStartDate: AUCTION_START_DATE,
      daysUntilAuction,
      isAuctionStarted,
      isEarlyBird,
      earlyBirdHoursLeft,
      crowdloanPhase,
      totalRaised,
      totalContributions,
      baseRewardRate,
    }),
    [
      AUCTION_START_DATE,
      daysUntilAuction,
      isAuctionStarted,
      isEarlyBird,
      earlyBirdHoursLeft,
      crowdloanPhase,
      totalRaised,
      totalContributions,
      baseRewardRate,
    ]
  );

  return (
    <AuctionContext.Provider value={ctx}>{children}</AuctionContext.Provider>
  );
};

export const useAuctionContext = () => useContext(AuctionContext);
