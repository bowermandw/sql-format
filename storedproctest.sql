create or alter procedure dbo.rpt_stuff (@user_id VARCHAR(20), @fiscal_year INT = 2025,
@some_param VARCHAR(50) = NULL,
@some_param2 VARCHAR(50) = NULL
)
as
begin
set nocount on;
select column1, column2, column3,
column4, 
case when column1 = 'asdf' then 1 else 0 end as column5
from dbo.some_table

if @@rowcount > 0 
    print 'good'
    else print 'bad'
end
go
