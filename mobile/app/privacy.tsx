import { H2, P, Screen } from "../src/ui/components";

// BORRADOR: el texto definitivo debe validarse con asesoría legal (Ley 1581 de 2012).
export default function Privacy() {
  return (
    <Screen>
      <H2>Política de tratamiento de datos personales</H2>
      <P muted>Borrador pendiente de revisión legal.</P>
      <P>Responsable: la empresa titular de la tienda y de esta app.</P>
      <P>Datos que tratamos: nombre, correo, teléfono (si lo registras), zona horaria, token de notificaciones, lecturas del tag de tus frascos, horarios de aplicación, puntos y canjes.</P>
      <P>Finalidades: verificar tus aplicaciones, enviarte recordatorios, asignar y redimir puntos, atender solicitudes de soporte, prevenir fraude y mejorar el producto.</P>
      <P>Derechos: conocer, actualizar, rectificar y suprimir tus datos y revocar la autorización. Puedes eliminar tu cuenta desde Perfil → Eliminar mi cuenta.</P>
      <P>Canal de atención: el correo de servicio al cliente indicado en la tienda.</P>
    </Screen>
  );
}
