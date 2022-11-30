'use strict'
require( 'dotenv' ).config()

const util            = require( 'util' )
,     fs              = require( 'fs' )
,     path            = require( 'path' )

,     http            = require( 'http' )
,     express         = require( 'express' )
,     hbs             = require( 'express-handlebars' )
,     cookieParser    = require( 'cookie-parser' )
,     app             = express()
,     server          = http.createServer( app )

,     socketIO        = require( 'socket.io' )
,     io              = new socketIO.Server( server )

,     winston       = require( 'winston' )
,     logger        = winston.createLogger({
                                              level:      'debug'
                                            , transports: [
                                                            new winston.transports.Console({
                                                                  format: winston.format.combine( winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' })
                                                                                                , winston.format.printf( info => `${ info.timestamp } --- ${ info.level }: ${ info.message }` )
                                                                                                )
                                                                })
                                                          , new winston.transports.File({ filename: path.join( __dirname, 'logs', 'app.log' )
                                                                                        , format:   winston.format.combine(
                                                                                                      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' })
                                                                                                    , winston.format.printf( info => `${ info.timestamp } | ${ info.level } | ${ info.message }` )
                                                                                                    )
                                                                })
                                                          ]
                                          })
,     msgLogger        = winston.createLogger({
                                              level:      'debug'
                                            , transports: [
                                                            new winston.transports.File({ filename: path.join( __dirname, 'logs', 'messages.log' )
                                                                                        , format:   winston.format.combine(
                                                                                                      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' })
                                                                                                    , winston.format.printf( info => `${ info.timestamp } | ${ info.level } | ${ info.message }` )
                                                                                                    )
                                                                })
                                                          ]
                                          })
;

/* .............................................................................
*
*  ..... middleware .....
*
*  ............................................................................. */

app.use( express.static( path.join( __dirname, 'public' )))
app.use( cookieParser() )
app.use( express.urlencoded({ extended: true }))
app.use( express.json() )


/* --- set view engine and map views directory --- */

app.set( 'views', path.join( __dirname, 'views' ))
app.engine( 'handlebars', hbs.engine() )
app.set( 'view engine', 'handlebars' )


/* ---------------------------------------------------------------------------------
*
*   ----- routes -----
*
*  --------------------------------------------------------------------------------- */

app.get( '/'
, ( req, res )=>{
  var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
  logger.info( `request from ${ ip }` )
  res.render( 'bla'
  , {
      layout: false
    , datetime:   new Date().toLocaleString( 'de-de' )
    , bla_group:  {
                    displayname: 'Zero'
                  }
    , env:    {
                url:    process.env.BLA_HTTP_URL
              , path:   process.env.BLA_HTTP_PATH
              }
    })
})


app.post( '/api/user'
, ( req, res )=>{
  var displayname = req.body.displayname
  displayname = displayname || 'Gast' + Math.random().toString(10).substring( 3, 9 )

  res.cookie( 'displayname', displayname )
  res.redirect( '/' )
})

/* =====================================================
*
*   ===== socket.io handler =====
*
*  ===================================================== */

/* lastMessages -> db replacement ;) */
var lastMessages = []

const emojiDict = { ':-)': '😀',':-D': '😄', ':-(': '😞', ';-)': '😉', '8-)': '😎', ':-p': '😛', ':-/': '🫤', ':-o': '😮', '@_@': '😵‍💫', ':ghost:': '👻', ':party:': '🥳' }

io.on( 'connection'
, socket => {
    socket.client.displayname = getDisplayname( socket.handshake.headers.cookie )
    logger.info( `a user connected from ${ socket.client.conn.remoteAddress } - displayname: ${ socket.client.displayname }` )
    lastMessages.forEach( message => socket.send( message ))
    io.emit(  'message'
            , { type:     'uikit_notification'
              , body:     `${ socket.client.displayname } kommt dazu`
              , options:  { status: 'success' }
              })

/* --- socket.io event handlers --- */
    socket.on( 'message'
    , msg =>{
      msgLogger.info( msg )

/* --- msg filter MSG_TOO_LONG --- */
      if( msg.length > 1023 ){
        socket.send({ type:     'uikit_notification'
                    , body:     `Nachricht zu lang - max sind ca. 1000 Zeichen`
                    , options:  { status: 'warning' }
                    })
      }

/* --- msg filter commands ( message starting with '\' ) --- */
      else if( msg[ 0 ] === '\\' ){
        let msgArray = msg.split( ' ' )

        switch( msgArray[ 0 ]){

/* --- command 'help' --- */
          case '\\help':
            socket.send({ type:         'posting'
                        , datetimeStr:  new Date().toLocaleString( 'de-de' )
                        , displayname:  'bla-Server'
                        , content:
`<ul>
  <li><b>\\emojis</b> -> Liste der Emoji-Ersetzungen</li>
  <li>Der Benutzername kann nach Löschen des 'displayname'-Cookies neu gewählt werden.</li>

</ul>`
                        })
            break;

/* show a list of character sequences that are replaced with according utf-8 chars */
          case '\\emojis':
            let erList    = Object.entries(emojiDict).map( em => em.join( '&nbsp;&nbsp;⭬&nbsp;&nbsp;' ))
            ,   helpHtml  = `<br>Folgende Emojis werden z.Z. ersetzt:<br>${ erList.join( '<br>' )}`
            socket.send({ type:         'posting'
                        , datetimeStr:  new Date().toLocaleString( 'de-de' )
                        , displayname:  'bla-Server'
                        , content:      helpHtml
                        })
            break;

/* --- example for undocumented cheat:
        command 'username' --- */
          case '\\username':
            socket.client.displayname = msgArray[ 1 ].substr( 0, 12 )
            socket.send({ type: 'uikit_notification'
                        , body: `username changed to ${ socket.client.displayname } 🖒`
                        , options: { status: 'success' }
                        })
            break;

          default:
            socket.send({ type: 'uikit_notification'
                        , body: `Das Kommando '${ msg }' ist leider noch nicht implementiert 😞`
                        , options: { status: 'danger' }
                        })
            break;
        }
      }

      else {
/* === emit msg to all clients === */

/* --- replace emojis --- */
        Object.entries( emojiDict ).forEach( emoji => msg = msg.replace( emoji[0], emoji[1] ))

        var message = { type:         'posting'
                      , datetimeStr:  new Date().toLocaleString( 'de-de' )
                      , displayname:  socket.client.displayname
                      , content:      msg
                      }
        lastMessages.push( message )
        lastMessages = lastMessages.slice( 0, process.env.BLA_N_MESSAGES )

        io.emit( 'message', message )
      }
    })

    socket.on( 'disconnect', ()=>{
      io.emit(  'message'
              , { type:     'uikit_notification'
                , body:     `${ socket.client.displayname } ist raus`
                , options:  { status: 'warning' }
                })
      logger.warn( `user ${ socket.client.displayname } disconnected` )
    })
})

function getDisplayname( handshakeCookie ){
  if( handshakeCookie === undefined ) return  'anonym' + Math.random().toString( 10 ).substring( 3, 9 )
  let cookiesArray  = handshakeCookie.split( ';' )
  ,   cookieMap     = new Map()
  ;
  cookiesArray.forEach( cookieStr =>{
    let cookieArr = cookieStr.split( '=' )
    cookieMap.set( cookieArr[0].trim(), cookieArr[1].trim() )
  })
  return cookieMap.has( 'displayname' ) ? cookieMap.get( 'displayname' ) : 'anonym' + Math.random().toString( 10 ).substring( 3, 9 )
}

/*-------------------------------------------------------------------------------------
*
*   ---   server start   ---
*
*--------------------------------------------------------------------------------------*/

server.listen(
  process.env.BLA_HTTP_PORT
, process.env.BLA_HTTP_LISTEN
, ( err )=>{
    logger.info( `Node.js Express+Socket.IO Server ${ process.env.BLA_HTTP_HOST } listening on ${ process.env.BLA_HTTP_LISTEN }:${ process.env.BLA_HTTP_PORT }` )
})
