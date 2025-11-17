-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Host: db
-- Generation Time: Nov 17, 2025 at 03:36 AM
-- Server version: 10.11.14-MariaDB-ubu2204
-- PHP Version: 8.3.27

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `tournament_app`
--

-- --------------------------------------------------------

--
-- Table structure for table `Games`
--

CREATE TABLE `Games` (
  `game_id` int(10) UNSIGNED NOT NULL,
  `match_id` int(10) UNSIGNED NOT NULL,
  `game_number` tinyint(3) UNSIGNED NOT NULL COMMENT 'e.g., 1, 2, 3',
  `killer_team_id` int(10) UNSIGNED NOT NULL,
  `survivor_team_id` int(10) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `GameScores`
--

CREATE TABLE `GameScores` (
  `game_score_id` int(10) UNSIGNED NOT NULL,
  `game_id` int(10) UNSIGNED NOT NULL,
  `killer_player_id` bigint(20) UNSIGNED NOT NULL,
  `survivor_1_id` bigint(20) UNSIGNED NOT NULL,
  `survivor_1_hooks` tinyint(3) UNSIGNED NOT NULL DEFAULT 0,
  `survivor_2_id` bigint(20) UNSIGNED NOT NULL,
  `survivor_2_hooks` tinyint(3) UNSIGNED NOT NULL DEFAULT 0,
  `survivor_3_id` bigint(20) UNSIGNED NOT NULL,
  `survivor_3_hooks` tinyint(3) UNSIGNED NOT NULL DEFAULT 0,
  `survivor_4_id` bigint(20) UNSIGNED NOT NULL,
  `survivor_4_hooks` tinyint(3) UNSIGNED NOT NULL DEFAULT 0,
  `gens_completed` tinyint(3) UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `KillerMaps`
--

CREATE TABLE `KillerMaps` (
  `id` int(11) NOT NULL,
  `killer_id` varchar(20) DEFAULT NULL,
  `map_id` int(11) DEFAULT NULL,
  `priority` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `KillerRules`
--

CREATE TABLE `KillerRules` (
  `rule_id` int(11) NOT NULL,
  `killer_id` varchar(20) DEFAULT NULL,
  `role` enum('Killer','Survivor') DEFAULT 'Killer',
  `category` varchar(50) DEFAULT NULL,
  `rule_text` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `Killers`
--

CREATE TABLE `Killers` (
  `killer_order` int(11) NOT NULL,
  `killer_id` varchar(20) NOT NULL,
  `killer_name` varchar(50) DEFAULT NULL,
  `art_url` varchar(256) NOT NULL,
  `allowed` tinyint(1) NOT NULL DEFAULT 1,
  `rulings` varchar(3000) NOT NULL,
  `tier` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `Maps`
--

CREATE TABLE `Maps` (
  `map_id` int(11) NOT NULL,
  `map_name` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `Matches`
--

CREATE TABLE `Matches` (
  `match_id` int(10) UNSIGNED NOT NULL,
  `tournament_id` int(10) UNSIGNED NOT NULL,
  `team_a_id` int(10) UNSIGNED DEFAULT NULL,
  `team_b_id` int(10) UNSIGNED DEFAULT NULL,
  `winner_id` int(10) UNSIGNED DEFAULT NULL,
  `loser_id` int(10) UNSIGNED DEFAULT NULL,
  `format` enum('Bo1','Bo3','Bo5') NOT NULL DEFAULT 'Bo3',
  `round_name` varchar(100) DEFAULT NULL COMMENT 'e.g., Quarter-Finals, Grand Finals',
  `scheduled_time` datetime DEFAULT NULL,
  `winner_advances_to_match_id` int(10) UNSIGNED DEFAULT NULL COMMENT 'The next match the winner plays in',
  `winner_advances_to_slot` enum('A','B') DEFAULT NULL COMMENT 'Which slot the winner takes in the next match'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `matchups`
--

CREATE TABLE `matchups` (
  `match_id` int(10) UNSIGNED NOT NULL,
  `tournament_id` int(10) NOT NULL,
  `team_a_id` int(10) UNSIGNED DEFAULT NULL,
  `team_b_id` int(10) UNSIGNED DEFAULT NULL,
  `round_name` varchar(255) DEFAULT NULL,
  `format` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `OverlayElements`
--

CREATE TABLE `OverlayElements` (
  `element_id` int(11) NOT NULL,
  `overlay_id` int(11) NOT NULL,
  `type` varchar(50) NOT NULL,
  `content` text DEFAULT NULL,
  `position_x` int(11) DEFAULT 0,
  `position_y` int(11) DEFAULT 0,
  `width` int(11) DEFAULT 100,
  `height` int(11) DEFAULT 50,
  `style` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`style`)),
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `Overlays`
--

CREATE TABLE `Overlays` (
  `overlay_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `unique_url_token` varchar(255) NOT NULL,
  `layout_config` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`layout_config`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `PickBans`
--

CREATE TABLE `PickBans` (
  `pick_ban_id` int(10) UNSIGNED NOT NULL,
  `match_id` int(10) UNSIGNED NOT NULL,
  `team_a_id` int(10) UNSIGNED NOT NULL,
  `team_b_id` int(10) UNSIGNED NOT NULL,
  `channel_id` bigint(20) UNSIGNED DEFAULT NULL,
  `status` enum('PENDING','IN_PROGRESS','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `PickBanSessions`
--

CREATE TABLE `PickBanSessions` (
  `pick_ban_id` int(10) UNSIGNED NOT NULL,
  `match_id` int(10) UNSIGNED NOT NULL,
  `banned_killers` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`banned_killers`)),
  `picked_killers` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`picked_killers`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `TeamMembers`
--

CREATE TABLE `TeamMembers` (
  `team_id` int(10) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `join_date` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `Teams`
--

CREATE TABLE `Teams` (
  `team_id` int(10) UNSIGNED NOT NULL,
  `team_name` varchar(255) NOT NULL,
  `captain_id` bigint(20) UNSIGNED NOT NULL,
  `logo_url` varchar(2048) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `role_id` bigint(20) UNSIGNED DEFAULT NULL COMMENT 'Discord Role ID for the team',
  `channel_id` bigint(20) UNSIGNED DEFAULT NULL COMMENT 'Discord Channel ID for the team',
  `color` varchar(7) DEFAULT NULL,
  `voice_channel_id` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `TierRules`
--

CREATE TABLE `TierRules` (
  `rule_id` int(11) NOT NULL,
  `tier_id` int(11) DEFAULT NULL,
  `role` enum('Killer','Survivor','Global') DEFAULT 'Global',
  `category` varchar(50) DEFAULT NULL,
  `rule_text` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `Tiers`
--

CREATE TABLE `Tiers` (
  `tier_id` int(11) NOT NULL,
  `tier_name` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `Tournaments`
--

CREATE TABLE `Tournaments` (
  `tournament_id` int(10) UNSIGNED NOT NULL,
  `name` varchar(255) NOT NULL,
  `start_date` datetime DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `TournamentTeams`
--

CREATE TABLE `TournamentTeams` (
  `tournament_id` int(10) UNSIGNED NOT NULL,
  `team_id` int(10) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `Users`
--

CREATE TABLE `Users` (
  `user_id` bigint(20) UNSIGNED NOT NULL COMMENT 'Discord User ID',
  `username` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `Games`
--
ALTER TABLE `Games`
  ADD PRIMARY KEY (`game_id`),
  ADD KEY `match_id` (`match_id`),
  ADD KEY `killer_team_id` (`killer_team_id`),
  ADD KEY `survivor_team_id` (`survivor_team_id`);

--
-- Indexes for table `GameScores`
--
ALTER TABLE `GameScores`
  ADD PRIMARY KEY (`game_score_id`),
  ADD UNIQUE KEY `game_id_unique` (`game_id`),
  ADD KEY `killer_player_id` (`killer_player_id`),
  ADD KEY `survivor_1_id` (`survivor_1_id`),
  ADD KEY `survivor_2_id` (`survivor_2_id`),
  ADD KEY `survivor_3_id` (`survivor_3_id`),
  ADD KEY `survivor_4_id` (`survivor_4_id`);

--
-- Indexes for table `KillerMaps`
--
ALTER TABLE `KillerMaps`
  ADD PRIMARY KEY (`id`),
  ADD KEY `KillerMaps_ibfk_1` (`killer_id`),
  ADD KEY `KillerMaps_ibfk_2` (`map_id`);

--
-- Indexes for table `KillerRules`
--
ALTER TABLE `KillerRules`
  ADD PRIMARY KEY (`rule_id`),
  ADD KEY `KillerRules_ibfk_1` (`killer_id`);

--
-- Indexes for table `Killers`
--
ALTER TABLE `Killers`
  ADD PRIMARY KEY (`killer_id`),
  ADD KEY `fk_killer_tier` (`tier`);

--
-- Indexes for table `Maps`
--
ALTER TABLE `Maps`
  ADD PRIMARY KEY (`map_id`),
  ADD UNIQUE KEY `map_name` (`map_name`);

--
-- Indexes for table `Matches`
--
ALTER TABLE `Matches`
  ADD PRIMARY KEY (`match_id`),
  ADD KEY `tournament_id` (`tournament_id`),
  ADD KEY `team_a_id` (`team_a_id`),
  ADD KEY `team_b_id` (`team_b_id`),
  ADD KEY `winner_id` (`winner_id`),
  ADD KEY `loser_id` (`loser_id`),
  ADD KEY `fk_winner_advances_to_match` (`winner_advances_to_match_id`);

--
-- Indexes for table `matchups`
--
ALTER TABLE `matchups`
  ADD PRIMARY KEY (`match_id`),
  ADD KEY `team1_id` (`team_a_id`),
  ADD KEY `team2_id` (`team_b_id`);

--
-- Indexes for table `OverlayElements`
--
ALTER TABLE `OverlayElements`
  ADD PRIMARY KEY (`element_id`),
  ADD KEY `overlay_id` (`overlay_id`);

--
-- Indexes for table `Overlays`
--
ALTER TABLE `Overlays`
  ADD PRIMARY KEY (`overlay_id`),
  ADD UNIQUE KEY `token_unique` (`unique_url_token`),
  ADD UNIQUE KEY `overlay_id` (`overlay_id`);

--
-- Indexes for table `PickBans`
--
ALTER TABLE `PickBans`
  ADD PRIMARY KEY (`pick_ban_id`),
  ADD UNIQUE KEY `match_id_unique` (`match_id`),
  ADD KEY `team_a_id` (`team_a_id`),
  ADD KEY `team_b_id` (`team_b_id`);

--
-- Indexes for table `PickBanSessions`
--
ALTER TABLE `PickBanSessions`
  ADD PRIMARY KEY (`pick_ban_id`),
  ADD UNIQUE KEY `match_id_unique` (`match_id`);

--
-- Indexes for table `TeamMembers`
--
ALTER TABLE `TeamMembers`
  ADD PRIMARY KEY (`team_id`,`user_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `Teams`
--
ALTER TABLE `Teams`
  ADD PRIMARY KEY (`team_id`),
  ADD UNIQUE KEY `team_name_unique` (`team_name`),
  ADD KEY `captain_id` (`captain_id`);

--
-- Indexes for table `TierRules`
--
ALTER TABLE `TierRules`
  ADD PRIMARY KEY (`rule_id`),
  ADD KEY `TierRules_ibfk_1` (`tier_id`);

--
-- Indexes for table `Tiers`
--
ALTER TABLE `Tiers`
  ADD PRIMARY KEY (`tier_id`);

--
-- Indexes for table `Tournaments`
--
ALTER TABLE `Tournaments`
  ADD PRIMARY KEY (`tournament_id`);

--
-- Indexes for table `TournamentTeams`
--
ALTER TABLE `TournamentTeams`
  ADD PRIMARY KEY (`tournament_id`,`team_id`),
  ADD KEY `team_id` (`team_id`);

--
-- Indexes for table `Users`
--
ALTER TABLE `Users`
  ADD PRIMARY KEY (`user_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `Games`
--
ALTER TABLE `Games`
  MODIFY `game_id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `GameScores`
--
ALTER TABLE `GameScores`
  MODIFY `game_score_id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `KillerMaps`
--
ALTER TABLE `KillerMaps`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `KillerRules`
--
ALTER TABLE `KillerRules`
  MODIFY `rule_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `Maps`
--
ALTER TABLE `Maps`
  MODIFY `map_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `Matches`
--
ALTER TABLE `Matches`
  MODIFY `match_id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `matchups`
--
ALTER TABLE `matchups`
  MODIFY `match_id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `OverlayElements`
--
ALTER TABLE `OverlayElements`
  MODIFY `element_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `Overlays`
--
ALTER TABLE `Overlays`
  MODIFY `overlay_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `PickBans`
--
ALTER TABLE `PickBans`
  MODIFY `pick_ban_id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `PickBanSessions`
--
ALTER TABLE `PickBanSessions`
  MODIFY `pick_ban_id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `Teams`
--
ALTER TABLE `Teams`
  MODIFY `team_id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `TierRules`
--
ALTER TABLE `TierRules`
  MODIFY `rule_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `Tournaments`
--
ALTER TABLE `Tournaments`
  MODIFY `tournament_id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `Games`
--
ALTER TABLE `Games`
  ADD CONSTRAINT `Games_ibfk_1` FOREIGN KEY (`match_id`) REFERENCES `Matches` (`match_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `Games_ibfk_2` FOREIGN KEY (`killer_team_id`) REFERENCES `Teams` (`team_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `Games_ibfk_3` FOREIGN KEY (`survivor_team_id`) REFERENCES `Teams` (`team_id`) ON DELETE CASCADE;

--
-- Constraints for table `GameScores`
--
ALTER TABLE `GameScores`
  ADD CONSTRAINT `GameScores_ibfk_1` FOREIGN KEY (`game_id`) REFERENCES `Games` (`game_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `GameScores_ibfk_2` FOREIGN KEY (`killer_player_id`) REFERENCES `Users` (`user_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `GameScores_ibfk_3` FOREIGN KEY (`survivor_1_id`) REFERENCES `Users` (`user_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `GameScores_ibfk_4` FOREIGN KEY (`survivor_2_id`) REFERENCES `Users` (`user_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `GameScores_ibfk_5` FOREIGN KEY (`survivor_3_id`) REFERENCES `Users` (`user_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `GameScores_ibfk_6` FOREIGN KEY (`survivor_4_id`) REFERENCES `Users` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `KillerMaps`
--
ALTER TABLE `KillerMaps`
  ADD CONSTRAINT `KillerMaps_ibfk_1` FOREIGN KEY (`killer_id`) REFERENCES `Killers` (`killer_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `KillerMaps_ibfk_2` FOREIGN KEY (`map_id`) REFERENCES `Maps` (`map_id`) ON DELETE CASCADE;

--
-- Constraints for table `KillerRules`
--
ALTER TABLE `KillerRules`
  ADD CONSTRAINT `KillerRules_ibfk_1` FOREIGN KEY (`killer_id`) REFERENCES `Killers` (`killer_id`) ON DELETE CASCADE;

--
-- Constraints for table `Killers`
--
ALTER TABLE `Killers`
  ADD CONSTRAINT `fk_killer_tier` FOREIGN KEY (`tier`) REFERENCES `Tiers` (`tier_id`);

--
-- Constraints for table `Matches`
--
ALTER TABLE `Matches`
  ADD CONSTRAINT `Matches_ibfk_1` FOREIGN KEY (`tournament_id`) REFERENCES `Tournaments` (`tournament_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `Matches_ibfk_2` FOREIGN KEY (`team_a_id`) REFERENCES `Teams` (`team_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `Matches_ibfk_3` FOREIGN KEY (`team_b_id`) REFERENCES `Teams` (`team_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `Matches_ibfk_4` FOREIGN KEY (`winner_id`) REFERENCES `Teams` (`team_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `Matches_ibfk_5` FOREIGN KEY (`loser_id`) REFERENCES `Teams` (`team_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_winner_advances_to_match` FOREIGN KEY (`winner_advances_to_match_id`) REFERENCES `Matches` (`match_id`) ON DELETE SET NULL;

--
-- Constraints for table `matchups`
--
ALTER TABLE `matchups`
  ADD CONSTRAINT `matchups_ibfk_1` FOREIGN KEY (`team_a_id`) REFERENCES `Teams` (`team_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `matchups_ibfk_2` FOREIGN KEY (`team_b_id`) REFERENCES `Teams` (`team_id`) ON DELETE SET NULL;

--
-- Constraints for table `OverlayElements`
--
ALTER TABLE `OverlayElements`
  ADD CONSTRAINT `OverlayElements_ibfk_1` FOREIGN KEY (`overlay_id`) REFERENCES `Overlays` (`overlay_id`) ON DELETE CASCADE;

--
-- Constraints for table `PickBans`
--
ALTER TABLE `PickBans`
  ADD CONSTRAINT `PickBans_ibfk_1` FOREIGN KEY (`match_id`) REFERENCES `Matches` (`match_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `PickBans_ibfk_2` FOREIGN KEY (`team_a_id`) REFERENCES `Teams` (`team_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `PickBans_ibfk_3` FOREIGN KEY (`team_b_id`) REFERENCES `Teams` (`team_id`) ON DELETE CASCADE;

--
-- Constraints for table `PickBanSessions`
--
ALTER TABLE `PickBanSessions`
  ADD CONSTRAINT `PickBanSessions_ibfk_1` FOREIGN KEY (`match_id`) REFERENCES `Matches` (`match_id`) ON DELETE CASCADE;

--
-- Constraints for table `TeamMembers`
--
ALTER TABLE `TeamMembers`
  ADD CONSTRAINT `TeamMembers_ibfk_1` FOREIGN KEY (`team_id`) REFERENCES `Teams` (`team_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `TeamMembers_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `Users` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `Teams`
--
ALTER TABLE `Teams`
  ADD CONSTRAINT `Teams_ibfk_1` FOREIGN KEY (`captain_id`) REFERENCES `Users` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `TierRules`
--
ALTER TABLE `TierRules`
  ADD CONSTRAINT `TierRules_ibfk_1` FOREIGN KEY (`tier_id`) REFERENCES `Tiers` (`tier_id`);

--
-- Constraints for table `TournamentTeams`
--
ALTER TABLE `TournamentTeams`
  ADD CONSTRAINT `TournamentTeams_ibfk_1` FOREIGN KEY (`tournament_id`) REFERENCES `Tournaments` (`tournament_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `TournamentTeams_ibfk_2` FOREIGN KEY (`team_id`) REFERENCES `Teams` (`team_id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
