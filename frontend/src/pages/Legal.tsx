import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ACCENT, Brand } from '../components/kit';
import { LEGAL } from '../legal/config';

/** Valor de la configuracion legal; si falta se resalta para que no se publique sin completar. */
const V = ({ k, label }: { k: keyof typeof LEGAL; label: string }) =>
  LEGAL[k] ? <>{LEGAL[k]}</> : <mark className="rounded bg-amber-400/25 px-1.5 text-amber-200">[{label}]</mark>;

function Layout({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#060b14] text-slate-200" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <header className="border-b border-white/[0.07] px-5 py-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link to="/" aria-label="Inicio"><Brand /></Link>
          <nav className="flex gap-4 text-sm text-slate-400">
            <Link to="/privacidad" className="hover:text-white">Privacidad</Link>
            <Link to="/terminos" className="hover:text-white">Términos</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <div className="text-xs font-semibold uppercase tracking-[.3em]" style={{ color: ACCENT }}>{LEGAL.service}</div>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-white">{title}</h1>
        <p className="mt-3 text-sm text-slate-400">Vigente desde el {LEGAL.effective}.</p>
        <p className="mt-6 leading-relaxed text-slate-300">{intro}</p>
        <div className="mt-8 space-y-8 leading-relaxed [&_a]:underline [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc [&_li]:py-0.5 [&_p+p]:mt-3 [&_ul]:mt-2">
          {children}
        </div>
        <footer className="mt-12 border-t border-white/[0.07] pt-6 text-sm text-slate-500">
          <Link to="/" className="hover:text-slate-300">← Volver al inicio</Link>
        </footer>
      </main>
    </div>
  );
}

const Contact = () => (
  <>
    <V k="contactArea" label="área de atención" />, correo <V k="email" label="correo de contacto" />, teléfono <V k="phone" label="teléfono" />
  </>
);

export function Privacy() {
  return (
    <Layout
      title="Política de tratamiento de datos personales"
      intro={`Esta política explica qué datos personales trata ${LEGAL.service}, para qué, con quién se comparten y cómo puedes ejercer tus derechos, de acuerdo con la Ley 1581 de 2012, el Decreto 1074 de 2015 y demás normas colombianas sobre protección de datos.`}
    >
      <section>
        <h2>1. Responsable del tratamiento</h2>
        <p>
          <V k="owner" label="razón social o nombre completo" />, identificado con NIT o cédula <V k="taxId" label="NIT o cédula" />, domicilio en <V k="address" label="ciudad y dirección" />. Correo: <V k="email" label="correo de contacto" />. Teléfono: <V k="phone" label="teléfono" />.
        </p>
      </section>

      <section>
        <h2>2. Aviso de privacidad (resumen)</h2>
        <p>
          Usamos algunos datos para operar la cola de canciones del local, moderar los pedidos, medir el uso del servicio y controlar el acceso del personal. No pedimos nombre, documento ni teléfono a quienes piden canciones desde la mesa. Esta política completa está disponible en <Link to="/privacidad">/privacidad</Link>, enlazada desde la primera pantalla del servicio.
        </p>
      </section>

      <section>
        <h2>3. Datos que recogemos</h2>
        <ul>
          <li><b>Cuentas del personal</b> (DJ, administradores y administradores de la plataforma): nombre, correo electrónico y credenciales de acceso (la contraseña se guarda cifrada).</li>
          <li><b>Clientes del local que piden canciones</b>: no se solicitan datos de identificación. Cada mesa tiene un código aleatorio (el del QR) y tu navegador guarda un identificador aleatorio persistente que acompaña tus escaneos, pedidos y calificaciones. No contiene tu nombre, pero permite vincular la actividad de un mismo navegador, por lo que lo tratamos como dato personal.</li>
          <li><b>Actividad del servicio</b>: escaneos del QR, búsquedas, canciones pedidas, aprobaciones, reproducción, calificaciones y la mesa desde la que se pidió.</li>
          <li><b>Datos técnicos</b>: registros del servidor necesarios para seguridad y funcionamiento (por ejemplo, dirección IP y fecha de la petición).</li>
        </ul>
      </section>

      <section>
        <h2>4. Para qué usamos los datos (finalidades)</h2>
        <ul>
          <li>Operar la cola de canciones y la pantalla del local.</li>
          <li>Permitir que el personal apruebe, rechace y ordene los pedidos.</li>
          <li>Medir el uso del servicio y mostrar estadísticas al establecimiento y a la plataforma.</li>
          <li>Controlar el acceso del personal y proteger el servicio frente a abusos.</li>
          <li>Atender tus peticiones, consultas y reclamos.</li>
        </ul>
        <p>No vendemos datos personales ni los usamos para publicidad propia.</p>
      </section>

      <section>
        <h2>5. Almacenamiento en tu navegador y cookies</h2>
        <p>
          Usamos <code>localStorage</code> y <code>sessionStorage</code> de tu navegador para recordar el identificador aleatorio, la sesión del personal y preferencias sencillas de la interfaz. No usamos cookies propias de seguimiento. Los servicios de Google que se incorporan (ver siguiente punto) pueden usar sus propias cookies y mostrar anuncios; puedes gestionarlas desde la configuración de tu navegador.
        </p>
      </section>

      <section>
        <h2>6. Servicios de terceros</h2>
        <p>
          La búsqueda y reproducción de videos usa servicios de Google: la API de YouTube y su reproductor incrustado, y Google Programmable Search. Al usarlos aplican los <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">Términos de servicio de YouTube</a> y la <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Política de privacidad de Google</a>. Podemos mostrar en pantalla resultados y anuncios que entrega Google.
        </p>
        <p>
          Para operar el servicio usamos los siguientes proveedores de infraestructura: hospedaje <V k="hosting" label="proveedor y región de hospedaje" /> y base de datos <V k="database" label="proveedor y región de base de datos" />. Estos proveedores tratan los datos por cuenta nuestra, y pueden estar fuera de Colombia; en ese caso adoptamos las medidas exigidas por la ley para la transferencia y transmisión internacional de datos.
        </p>
        <p>También podemos entregar datos a autoridades cuando una norma o una orden judicial lo exija.</p>
      </section>

      <section>
        <h2>7. Conservación</h2>
        <p>
          Conservamos los pedidos y eventos de actividad durante <V k="retention" label="plazo de conservación" />, y las cuentas del personal mientras estén activas. Pasado ese tiempo, o cuando solicites su supresión y proceda legalmente, los eliminamos o los anonimizamos. Algunos datos pueden conservarse más tiempo si una norma lo exige.
        </p>
      </section>

      <section>
        <h2>8. Tus derechos como titular</h2>
        <p>Tienes derecho a:</p>
        <ul>
          <li>Conocer, actualizar y rectificar tus datos personales.</li>
          <li>Solicitar prueba de la autorización otorgada y ser informado del uso que se ha dado a tus datos.</li>
          <li>Revocar la autorización y solicitar la supresión de tus datos cuando no se respeten los principios y garantías legales.</li>
          <li>Presentar quejas ante la Superintendencia de Industria y Comercio (SIC) por infracciones a la ley.</li>
          <li>Acceder de forma gratuita a tus datos personales.</li>
        </ul>
        <p>
          Como el servicio no te identifica por nombre, para localizar tu información indícanos el asunto de tu solicitud y, si aplica, el establecimiento, la mesa y la fecha aproximada de uso.
        </p>
      </section>

      <section>
        <h2>9. Cómo ejercer tus derechos</h2>
        <p>
          Las peticiones, consultas y reclamos los atiende: <Contact />. Escríbenos indicando tu solicitud y datos de contacto para responderte.
        </p>
        <ul>
          <li><b>Consultas</b>: las respondemos en máximo 10 días hábiles desde su recibo (prorrogables 5 días hábiles más, informándote los motivos).</li>
          <li><b>Reclamos</b> de corrección, actualización o supresión: los respondemos en máximo 15 días hábiles (prorrogables 8 días hábiles más, informándote los motivos).</li>
        </ul>
        <p>Si no estás conforme con la respuesta, puedes acudir a la Superintendencia de Industria y Comercio.</p>
      </section>

      <section>
        <h2>10. Menores de edad</h2>
        <p>El servicio no está dirigido a menores y no recoge intencionalmente datos de identificación de ellos. Si crees que un menor nos entregó datos, escríbenos para eliminarlos.</p>
      </section>

      <section>
        <h2>11. Seguridad</h2>
        <p>Aplicamos medidas razonables de seguridad: conexiones cifradas, contraseñas almacenadas con cifrado, acceso por roles y separación de la información entre establecimientos. Ningún sistema es totalmente infalible; avísanos si detectas un problema de seguridad.</p>
      </section>

      <section>
        <h2>12. Vigencia y cambios</h2>
        <p>
          Esta política rige desde el {LEGAL.effective}. La base de datos tendrá vigencia mientras subsista la finalidad del tratamiento. Los cambios sustanciales, como un nuevo responsable o una nueva finalidad, se informarán antes de aplicarse y, si cambia la finalidad, pediremos una nueva autorización.
        </p>
      </section>
    </Layout>
  );
}

export function Terms() {
  return (
    <Layout
      title="Términos y condiciones de uso"
      intro={`Estos términos regulan el uso de ${LEGAL.service}, incluida la pantalla que ves al escanear el código QR de una mesa, la pantalla de TV, el panel del DJ y los paneles de administración. Al usar el servicio aceptas estos términos.`}
    >
      <section>
        <h2>1. Quién ofrece el servicio</h2>
        <p>
          El servicio lo presta <V k="owner" label="razón social o nombre completo" /> (NIT o cédula <V k="taxId" label="NIT o cédula" />), con domicilio en <V k="address" label="ciudad y dirección" />. Contacto: <V k="email" label="correo de contacto" />.
        </p>
      </section>

      <section>
        <h2>2. Qué es el servicio</h2>
        <p>
          {LEGAL.service} es una plataforma para bares y locales que permite a sus clientes pedir canciones de karaoke desde su celular, organizar una cola de reproducción y mostrarla en una pantalla del local. Los videos se buscan y reproducen mediante servicios de terceros como YouTube; no alojamos ni somos propietarios de ese contenido.
        </p>
      </section>

      <section>
        <h2>3. Clientes del local</h2>
        <ul>
          <li>Puedes pedir canciones sin crear una cuenta. El local y su DJ pueden aprobar, rechazar, reordenar o saltar cualquier pedido.</li>
          <li>El local define cuántas canciones puede tener en espera cada mesa y si las solicitudes están abiertas.</li>
          <li>No uses el servicio para pedir contenido ilegal, ofensivo o que infrinja derechos de terceros, ni para saturar o interferir con el funcionamiento.</li>
          <li>El tratamiento de tus datos se describe en la <Link to="/privacidad">Política de tratamiento de datos personales</Link>.</li>
        </ul>
      </section>

      <section>
        <h2>4. Establecimientos y su personal</h2>
        <ul>
          <li>Para administrar un establecimiento debes registrarte con datos veraces y mantener segura tu contraseña. Eres responsable de la actividad realizada con tu cuenta y de las cuentas de tu equipo.</li>
          <li>Eres responsable de contar con las licencias y autorizaciones necesarias para la comunicación pública de música y videos en tu local (por ejemplo, ante las sociedades de gestión colectiva), así como del contenido que se reproduce en tu pantalla.</li>
          <li>Los códigos QR de tus mesas son tuyos para uso en tu establecimiento. Puedes revocarlos y regenerarlos cuando quieras.</li>
          <li>Eres responsable frente a tus clientes por el uso que hagas de sus datos fuera de la plataforma.</li>
        </ul>
      </section>

      <section>
        <h2>5. Servicios de terceros</h2>
        <p>
          El uso de YouTube y de Google está sujeto a sus propios términos: <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">Términos de servicio de YouTube</a> y <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer">Términos de Google</a>. Un video puede dejar de estar disponible o no poder reproducirse en la pantalla del local sin que dependa de nosotros. La búsqueda tiene cupos diarios; cuando se agotan podemos usar un buscador alternativo de Google.
        </p>
      </section>

      <section>
        <h2>6. Uso aceptable</h2>
        <ul>
          <li>No intentes acceder a cuentas, mesas o información de otros establecimientos.</li>
          <li>No uses procesos automáticos para buscar o pedir canciones, ni intentes eludir los límites o la seguridad del servicio.</li>
          <li>No copies, vendas ni revendas el servicio sin autorización.</li>
        </ul>
        <p>Podemos suspender cuentas o establecimientos que incumplan estos términos o pongan en riesgo el servicio.</p>
      </section>

      <section>
        <h2>7. Propiedad intelectual</h2>
        <p>El software, los diseños, marcas y textos de {LEGAL.service} pertenecen a su titular. Estos términos no te transfieren ningún derecho sobre ellos, salvo el de usar el servicio según su finalidad. Las imágenes que sube un establecimiento (por ejemplo, el banner de la TV) siguen siendo suyas y garantiza que tiene derecho a usarlas.</p>
      </section>

      <section>
        <h2>8. Disponibilidad y cambios</h2>
        <p>Procuramos que el servicio funcione de forma continua, pero se ofrece «tal como está»: puede haber interrupciones por mantenimiento, fallas de internet o de terceros. Podemos modificar o retirar funciones, avisando con antelación razonable cuando el cambio sea importante.</p>
      </section>

      <section>
        <h2>9. Limitación de responsabilidad</h2>
        <p>En la medida permitida por la ley, no respondemos por interrupciones del servicio, por contenido de terceros, ni por el uso que cada establecimiento haga de la música y los videos en su local. Esto no limita derechos que la ley colombiana reconoce a los consumidores ni la responsabilidad que no pueda excluirse legalmente.</p>
      </section>

      <section>
        <h2>10. Terminación</h2>
        <p>Un establecimiento puede dejar de usar el servicio en cualquier momento. Nosotros podemos suspender o cerrar cuentas por incumplimiento de estos términos o por orden de autoridad. Al terminar, los datos se tratan según la política de privacidad.</p>
      </section>

      <section>
        <h2>11. Cambios a estos términos</h2>
        <p>Podemos actualizar estos términos. Los cambios importantes se informarán dentro del servicio o por correo antes de aplicarse; seguir usando el servicio después significa que los aceptas.</p>
      </section>

      <section>
        <h2>12. Ley aplicable y contacto</h2>
        <p>
          Estos términos se rigen por las leyes de la República de Colombia. Las controversias se someterán a los jueces competentes de <V k="jurisdictionCity" label="ciudad" />, sin perjuicio de los derechos del consumidor ante la Superintendencia de Industria y Comercio. Para dudas o reclamos: <Contact />.
        </p>
        <p>Estos términos rigen desde el {LEGAL.effective}.</p>
      </section>
    </Layout>
  );
}
