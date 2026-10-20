-- SAN-1556 · Replace four dead tourist-destination photos with real, openly licensed ones.
--
-- Why: the stored links for Comuna 13, Plaza Botero, Parque Arví and Museo de Antioquia pointed at
-- Wikimedia Commons paths that do not load (the folder hash does not match the file name, and for three
-- of the four the file name does not exist on Commons at all). The homepage therefore showed text-only
-- cards. Each replacement below was found through the Commons API, opened, and checked by eye to show
-- the named place; its author, licence and source page are stored next to the URL so the site can credit it.
--
-- Scope: exactly these four rows, only `primary_image_url` and `details.image_credit`. Each UPDATE is
-- guarded by the row id AND the old URL, so it is safe to replay and never overwrites a later edit.
-- No schema change, no RLS change, no other row touched.
--
-- Rollback (per row): set primary_image_url back to the old URL named in the guard and
--   details = details - 'image_credit'.
--
-- Interim hosting: the images are served from Wikimedia Commons (allowed in next.config through
-- src/lib/images/remote-image-hosts.ts, restricted to /wikipedia/commons/). Copying them into our own
-- Supabase Storage is the longer-term home and is a follow-up.

-- Comuna 13
update public.tourist_destinations
set primary_image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Comuna_13%2C_Medell%C3%ADn_02.jpg/960px-Comuna_13%2C_Medell%C3%ADn_02.jpg',
    details = coalesce(details, '{}'::jsonb) || jsonb_build_object('image_credit', jsonb_build_object(
      'source', 'Wikimedia Commons',
      'image_url', 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Comuna_13%2C_Medell%C3%ADn_02.jpg/960px-Comuna_13%2C_Medell%C3%ADn_02.jpg',
      'title', 'File:Comuna 13, Medellín 02.jpg',
      'author', 'Bernard Gagnon',
      'license', 'CC BY-SA 4.0',
      'license_url', 'https://creativecommons.org/licenses/by-sa/4.0/',
      'source_url', 'https://commons.wikimedia.org/wiki/File:Comuna_13,_Medell%C3%ADn_02.jpg',
      'alt', 'Brick houses climbing the green hillsides of Comuna 13 in Medellín',
      'checked_on', '2026-10-20'
    ))
where id = 'a8e48bcd-9976-4b4c-bf50-ffb6b1e68727'
  and primary_image_url = 'https://upload.wikimedia.org/wikipedia/commons/9/9f/Comuna_13_Medellin.jpg';

-- Plaza Botero
update public.tourist_destinations
set primary_image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Medell%C3%ADn%2C_Plaza_Botero%2C_2023-07_CN-01.jpg/960px-Medell%C3%ADn%2C_Plaza_Botero%2C_2023-07_CN-01.jpg',
    details = coalesce(details, '{}'::jsonb) || jsonb_build_object('image_credit', jsonb_build_object(
      'source', 'Wikimedia Commons',
      'image_url', 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Medell%C3%ADn%2C_Plaza_Botero%2C_2023-07_CN-01.jpg/960px-Medell%C3%ADn%2C_Plaza_Botero%2C_2023-07_CN-01.jpg',
      'title', 'File:Medellín, Plaza Botero, 2023-07 CN-01.jpg',
      'author', 'Steffen Schmitz',
      'license', 'CC BY-SA 4.0',
      'license_url', 'https://creativecommons.org/licenses/by-sa/4.0/',
      'source_url', 'https://commons.wikimedia.org/wiki/File:Medell%C3%ADn,_Plaza_Botero,_2023-07_CN-01.jpg',
      'alt', 'Fernando Botero''s bronze sculptures in Plaza Botero, with the Museo de Antioquia behind',
      'checked_on', '2026-10-20'
    ))
where id = '0e499a0a-c8c3-432f-a3d9-e9502fc8674c'
  and primary_image_url = 'https://upload.wikimedia.org/wikipedia/commons/0/05/Plaza_Botero_Medellin.jpg';

-- Parque Arví
update public.tourist_destinations
set primary_image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Bosque_Parque_Arv%C3%AD.JPG/960px-Bosque_Parque_Arv%C3%AD.JPG',
    details = coalesce(details, '{}'::jsonb) || jsonb_build_object('image_credit', jsonb_build_object(
      'source', 'Wikimedia Commons',
      'image_url', 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Bosque_Parque_Arv%C3%AD.JPG/960px-Bosque_Parque_Arv%C3%AD.JPG',
      'title', 'File:Bosque Parque Arví.JPG',
      'author', 'Paco Godoy',
      'license', 'CC BY-SA 3.0',
      'license_url', 'https://creativecommons.org/licenses/by-sa/3.0/',
      'source_url', 'https://commons.wikimedia.org/wiki/File:Bosque_Parque_Arv%C3%AD.JPG',
      'alt', 'A forest trail among tall trees and ferns in Parque Arví, above Medellín',
      'checked_on', '2026-10-20'
    ))
where id = 'd682e420-f6dd-4d14-bb02-a2b99470679b'
  and primary_image_url = 'https://upload.wikimedia.org/wikipedia/commons/7/7f/Parque_Arvi.jpg';

-- Museo de Antioquia
update public.tourist_destinations
set primary_image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/Medell%C3%ADn%2C_Museo_de_Antioquia%2C_2023-07_CN-01.jpg/960px-Medell%C3%ADn%2C_Museo_de_Antioquia%2C_2023-07_CN-01.jpg',
    details = coalesce(details, '{}'::jsonb) || jsonb_build_object('image_credit', jsonb_build_object(
      'source', 'Wikimedia Commons',
      'image_url', 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/Medell%C3%ADn%2C_Museo_de_Antioquia%2C_2023-07_CN-01.jpg/960px-Medell%C3%ADn%2C_Museo_de_Antioquia%2C_2023-07_CN-01.jpg',
      'title', 'File:Medellín, Museo de Antioquia, 2023-07 CN-01.jpg',
      'author', 'Steffen Schmitz',
      'license', 'CC BY-SA 4.0',
      'license_url', 'https://creativecommons.org/licenses/by-sa/4.0/',
      'source_url', 'https://commons.wikimedia.org/wiki/File:Medell%C3%ADn,_Museo_de_Antioquia,_2023-07_CN-01.jpg',
      'alt', 'The Museo de Antioquia building on Plaza Botero in Medellín',
      'checked_on', '2026-10-20'
    ))
where id = 'ed4d7cdd-2911-4d39-b709-c11aaa5772bf'
  and primary_image_url = 'https://upload.wikimedia.org/wikipedia/commons/3/36/Museo_de_Antioquia.jpg';
