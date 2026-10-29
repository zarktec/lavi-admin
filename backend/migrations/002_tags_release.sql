-- Permiso para liberar tags reclamados (acción destructiva). Solo el superadministrador lo tiene por defecto;
-- se puede asignar a otros roles desde el panel.
insert into permissions (code, description) values
  ('tags.release', 'Liberar tags reclamados: borra su tratamiento y permite activarlos de nuevo')
on conflict (code) do nothing;
