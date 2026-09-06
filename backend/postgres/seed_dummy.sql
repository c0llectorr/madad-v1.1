-- MADAD dummy seed (generated)
BEGIN;
TRUNCATE dispatch_reroutes, damaged_roads, dispatches, inventory, depots, sites, reports, users, support_centers RESTART IDENTITY CASCADE;
INSERT INTO support_centers (code, name, region, lat, lng) VALUES
('PB-01', 'Punjab Provincial Relief Center', 'Punjab', 31.5497, 74.3436),
('SD-01', 'Sindh Provincial Relief Center', 'Sindh', 24.8607, 67.0011),
('KP-01', 'Khyber Pakhtunkhwa Relief Center', 'Khyber Pakhtunkhwa', 34.0151, 71.5249),
('BL-01', 'Balochistan Provincial Relief Center', 'Balochistan', 30.1798, 66.975),
('IS-01', 'Federal Capital Relief Center', 'Islamabad Capital Territory', 33.6844, 73.0479);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES (NULL, 'admin', '$2b$12$sJYnsZM88WXtNW9zvbJYMuNH5m2A1qsVcdbVtSzm7pecwEaGwOGPy', 'administrator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='PB-01'), 'ahmed.raza', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='PB-01'), 'fatima.noor', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='PB-01'), 'bilal.chishti', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='PB-01'), 'ayesha.siddiqui', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='PB-01'), 'usman.bokhari', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='SD-01'), 'sana.qureshi', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='SD-01'), 'imran.memon', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='SD-01'), 'hina.shah', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='SD-01'), 'faisal.abro', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='SD-01'), 'zarina.baloch', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='KP-01'), 'kamran.yousafzai', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='KP-01'), 'sadia.khattak', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='KP-01'), 'tariq.durrani', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='KP-01'), 'rubina.gul', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='KP-01'), 'shakeel.ahmad', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='BL-01'), 'basit.rind', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='BL-01'), 'mahnoor.sanjrani', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='BL-01'), 'javed.mengal', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='BL-01'), 'nabeela.das', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='BL-01'), 'abdul.wahid', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='IS-01'), 'hassan.jafferi', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='IS-01'), 'mehreen.malik', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='IS-01'), 'owais.tarar', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='IS-01'), 'kiran.haider', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO users (center_id, username, password_hash, role, is_active) VALUES ((SELECT id FROM support_centers WHERE code='IS-01'), 'zeeshan.qazi', '$2b$12$layJ3ZMDbtdVYKaKGR3PzuitflQqJqvfU3N.rCnn2N4w8nfeA53pC', 'coordinator', true);
INSERT INTO depots (center_id, name, lat, lng) VALUES
((SELECT id FROM support_centers WHERE code='PB-01'), 'Lahore Central Warehouse', 31.5497, 74.3436),
((SELECT id FROM support_centers WHERE code='PB-01'), 'Faisalabad Depot', 31.4187, 73.0791),
((SELECT id FROM support_centers WHERE code='PB-01'), 'Multan Depot', 30.1575, 71.5249),
((SELECT id FROM support_centers WHERE code='PB-01'), 'Rawalpindi Depot', 33.5651, 73.0169),
((SELECT id FROM support_centers WHERE code='PB-01'), 'Dera Ghazi Khan Depot', 30.049, 70.6403),
((SELECT id FROM support_centers WHERE code='SD-01'), 'Karachi Port Depot', 24.8607, 67.0011),
((SELECT id FROM support_centers WHERE code='SD-01'), 'Hyderabad Depot', 25.396, 68.3578),
((SELECT id FROM support_centers WHERE code='SD-01'), 'Sukkur Barrage Depot', 27.7052, 68.8574),
((SELECT id FROM support_centers WHERE code='SD-01'), 'Larkana Depot', 27.559, 68.2123),
((SELECT id FROM support_centers WHERE code='SD-01'), 'Mirpur Khas Depot', 25.5276, 69.0122),
((SELECT id FROM support_centers WHERE code='KP-01'), 'Peshawar Central Depot', 34.0151, 71.5249),
((SELECT id FROM support_centers WHERE code='KP-01'), 'Mardan Depot', 34.198, 72.0233),
((SELECT id FROM support_centers WHERE code='KP-01'), 'Abbottabad Depot', 34.1688, 73.2215),
((SELECT id FROM support_centers WHERE code='KP-01'), 'Dera Ismail Khan Depot', 31.8313, 70.9017),
((SELECT id FROM support_centers WHERE code='KP-01'), 'Mingora Swat Depot', 34.7795, 72.3614),
((SELECT id FROM support_centers WHERE code='BL-01'), 'Quetta Central Depot', 30.1798, 66.975),
((SELECT id FROM support_centers WHERE code='BL-01'), 'Gwadar Port Depot', 25.1264, 62.3225),
((SELECT id FROM support_centers WHERE code='BL-01'), 'Turbat Depot', 26.0031, 63.0582),
((SELECT id FROM support_centers WHERE code='BL-01'), 'Khuzdar Depot', 27.8, 66.6167),
((SELECT id FROM support_centers WHERE code='BL-01'), 'Chaman Border Depot', 30.921, 66.4524),
((SELECT id FROM support_centers WHERE code='IS-01'), 'Islamabad Sector G-9 Depot', 33.6844, 73.0479),
((SELECT id FROM support_centers WHERE code='IS-01'), 'Murree Hill Depot', 33.907, 73.3943),
((SELECT id FROM support_centers WHERE code='IS-01'), 'Taxila Depot', 33.7465, 72.7875),
((SELECT id FROM support_centers WHERE code='IS-01'), 'Attock River Depot', 33.766, 72.36),
((SELECT id FROM support_centers WHERE code='IS-01'), 'Haripur Depot', 33.9945, 72.9324);
INSERT INTO inventory (depot_id, resource_type, quantity)
VALUES
(1, 'food', 400),
(1, 'water', 400),
(1, 'boats', 40),
(1, 'medicine', 4000),
(1, 'clothes', 4000),
(2, 'food', 400),
(2, 'water', 400),
(2, 'boats', 40),
(2, 'medicine', 4000),
(2, 'clothes', 4000),
(3, 'food', 400),
(3, 'water', 400),
(3, 'boats', 40),
(3, 'medicine', 4000),
(3, 'clothes', 4000),
(4, 'food', 400),
(4, 'water', 400),
(4, 'boats', 40),
(4, 'medicine', 4000),
(4, 'clothes', 4000),
(5, 'food', 400),
(5, 'water', 400),
(5, 'boats', 40),
(5, 'medicine', 4000),
(5, 'clothes', 4000),
(6, 'food', 400),
(6, 'water', 400),
(6, 'boats', 40),
(6, 'medicine', 4000),
(6, 'clothes', 4000),
(7, 'food', 400),
(7, 'water', 400),
(7, 'boats', 40),
(7, 'medicine', 4000),
(7, 'clothes', 4000),
(8, 'food', 400),
(8, 'water', 400),
(8, 'boats', 40),
(8, 'medicine', 4000),
(8, 'clothes', 4000),
(9, 'food', 400),
(9, 'water', 400),
(9, 'boats', 40),
(9, 'medicine', 4000),
(9, 'clothes', 4000),
(10, 'food', 400),
(10, 'water', 400),
(10, 'boats', 40),
(10, 'medicine', 4000),
(10, 'clothes', 4000),
(11, 'food', 400),
(11, 'water', 400),
(11, 'boats', 40),
(11, 'medicine', 4000),
(11, 'clothes', 4000),
(12, 'food', 400),
(12, 'water', 400),
(12, 'boats', 40),
(12, 'medicine', 4000),
(12, 'clothes', 4000),
(13, 'food', 400),
(13, 'water', 400),
(13, 'boats', 40),
(13, 'medicine', 4000),
(13, 'clothes', 4000),
(14, 'food', 400),
(14, 'water', 400),
(14, 'boats', 40),
(14, 'medicine', 4000),
(14, 'clothes', 4000),
(15, 'food', 400),
(15, 'water', 400),
(15, 'boats', 40),
(15, 'medicine', 4000),
(15, 'clothes', 4000),
(16, 'food', 400),
(16, 'water', 400),
(16, 'boats', 40),
(16, 'medicine', 4000),
(16, 'clothes', 4000),
(17, 'food', 400),
(17, 'water', 400),
(17, 'boats', 40),
(17, 'medicine', 4000),
(17, 'clothes', 4000),
(18, 'food', 400),
(18, 'water', 400),
(18, 'boats', 40),
(18, 'medicine', 4000),
(18, 'clothes', 4000),
(19, 'food', 400),
(19, 'water', 400),
(19, 'boats', 40),
(19, 'medicine', 4000),
(19, 'clothes', 4000),
(20, 'food', 400),
(20, 'water', 400),
(20, 'boats', 40),
(20, 'medicine', 4000),
(20, 'clothes', 4000),
(21, 'food', 400),
(21, 'water', 400),
(21, 'boats', 40),
(21, 'medicine', 4000),
(21, 'clothes', 4000),
(22, 'food', 400),
(22, 'water', 400),
(22, 'boats', 40),
(22, 'medicine', 4000),
(22, 'clothes', 4000),
(23, 'food', 400),
(23, 'water', 400),
(23, 'boats', 40),
(23, 'medicine', 4000),
(23, 'clothes', 4000),
(24, 'food', 400),
(24, 'water', 400),
(24, 'boats', 40),
(24, 'medicine', 4000),
(24, 'clothes', 4000),
(25, 'food', 400),
(25, 'water', 400),
(25, 'boats', 40),
(25, 'medicine', 4000),
(25, 'clothes', 4000);
COMMIT;